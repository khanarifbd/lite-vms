from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import IdentifierType
from app.core.config import settings
from app.core.database import get_session
from app.integrations.sms import SMSDeliveryError, send_sms
from app.modules.audit.service import write_audit_log
from app.modules.auth.model import User, UserIdentifier
from app.modules.auth.security import verify_password
from app.modules.auth.service import change_password, get_security
from app.modules.drivers.enums import DriverClaimStatus
from app.modules.drivers.model import Driver
from app.modules.drivers.recovery_model import DriverMobilePasswordResetChallenge
from app.modules.drivers.recovery_service import (
    as_utc,
    create_driver_mobile_challenge,
    invalidate_driver_mobile_challenges,
    latest_driver_mobile_challenge,
)
from app.modules.drivers.schema import (
    DriverMobilePasswordResetConfirm,
    DriverMobilePasswordResetRequest,
    DriverMobilePasswordResetRequestResult,
    DriverMobilePasswordResetResult,
)
from app.modules.drivers.service import get_driver_by_nid, get_driver_username
from app.modules.owners.recovery_service import otp_matches

router = APIRouter(
    prefix="/drivers/password-reset/mobile",
    tags=["Driver Account Recovery"],
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post(
    "/request",
    response_model=DriverMobilePasswordResetRequestResult,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_driver_mobile_password_reset(
    payload: DriverMobilePasswordResetRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverMobilePasswordResetRequestResult:
    driver = await get_driver_by_nid(session, payload.nid_reference)
    if driver is None or driver.phone != payload.mobile:
        raise HTTPException(
            status_code=400,
            detail="The NID or registered mobile number does not match",
        )
    mobile_identifier = await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.user_id == driver.user_id,
            UserIdentifier.identifier_type == IdentifierType.MOBILE,
            UserIdentifier.normalized_value == payload.mobile,
            UserIdentifier.disabled_at.is_(None),
        )
    )
    if mobile_identifier is None:
        raise HTTPException(
            status_code=409,
            detail="The driver account does not have this mobile login identifier",
        )

    now = datetime.now(UTC)
    latest = await latest_driver_mobile_challenge(session, driver_id=driver.id)
    if latest is not None:
        available_at = as_utc(latest.created_at) + timedelta(
            seconds=settings.owner_password_reset_otp_cooldown_seconds
        )
        if available_at > now:
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Please wait before requesting another OTP",
                    "retry_after_seconds": max(1, int((available_at - now).total_seconds())),
                },
            )

    challenge, otp = await create_driver_mobile_challenge(
        session,
        driver_id=driver.id,
        user_id=driver.user_id,
        normalized_mobile=payload.mobile,
        requested_ip=request_ip(request),
    )
    message = (
        f"আপনার {settings.app_name} ড্রাইভার অ্যাকাউন্ট পাসওয়ার্ড রিসেট OTP: {otp}. "
        f"এটি {settings.owner_password_reset_otp_expire_minutes} মিনিটের মধ্যে ব্যবহার করুন।"
    )
    try:
        delivery_status = await send_sms(mobile=payload.mobile, message=message)
    except SMSDeliveryError as exc:
        await session.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from None

    await write_audit_log(
        session,
        actor_user_id=driver.user_id,
        action="driver.mobile_password_reset_requested",
        resource_type="driver_mobile_password_reset_challenge",
        resource_public_id=challenge.id,
        ip_address=request_ip(request),
        new_values={"delivery_status": delivery_status},
    )
    await session.commit()
    expose_otp = settings.app_env.strip().lower() in {"development", "testing"}
    return DriverMobilePasswordResetRequestResult(
        challenge_id=challenge.id,
        mobile=payload.mobile,
        expires_in_seconds=settings.owner_password_reset_otp_expire_minutes * 60,
        delivery_status=delivery_status,
        development_otp=otp if expose_otp else None,
        message="OTP sent to the registered mobile number",
    )


@router.post("/confirm", response_model=DriverMobilePasswordResetResult)
async def confirm_driver_mobile_password_reset(
    payload: DriverMobilePasswordResetConfirm,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverMobilePasswordResetResult:
    challenge = await session.get(DriverMobilePasswordResetChallenge, payload.challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Password-reset challenge not found")
    now = datetime.now(UTC)
    if challenge.consumed_at is not None:
        raise HTTPException(status_code=409, detail="This OTP has already been used")
    if challenge.invalidated_at is not None:
        raise HTTPException(status_code=409, detail="This OTP is no longer valid")
    if as_utc(challenge.expires_at) <= now:
        challenge.invalidated_at = now
        await session.commit()
        raise HTTPException(status_code=410, detail="The OTP has expired")
    if challenge.attempt_count >= challenge.max_attempts:
        challenge.invalidated_at = now
        await session.commit()
        raise HTTPException(status_code=429, detail="Maximum OTP attempts exceeded")
    if not otp_matches(
        challenge_id=challenge.id,
        otp=payload.otp,
        expected_digest=challenge.otp_digest,
    ):
        challenge.attempt_count += 1
        if challenge.attempt_count >= challenge.max_attempts:
            challenge.invalidated_at = now
        await session.commit()
        raise HTTPException(status_code=400, detail="The OTP is incorrect")

    driver = await session.get(Driver, challenge.driver_id)
    user = await session.get(User, challenge.user_id)
    if driver is None or user is None or driver.user_id != challenge.user_id:
        raise HTTPException(status_code=409, detail="Driver account relationship is invalid")
    security = await get_security(session, challenge.user_id)
    if security is None:
        raise HTTPException(status_code=409, detail="Driver security record is missing")
    if verify_password(payload.new_password, security.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different")

    mobile_identifier = await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.user_id == challenge.user_id,
            UserIdentifier.identifier_type == IdentifierType.MOBILE,
            UserIdentifier.normalized_value == challenge.normalized_mobile,
            UserIdentifier.disabled_at.is_(None),
        )
    )
    if mobile_identifier is None:
        raise HTTPException(status_code=409, detail="Registered mobile identifier is missing")

    await change_password(
        session,
        user=user,
        new_password=payload.new_password,
        must_change_password=False,
    )
    driver.claim_status = DriverClaimStatus.CLAIMED
    challenge.consumed_at = now
    mobile_identifier.is_verified = True
    mobile_identifier.verified_at = now
    mobile_identifier.verification_method = "mobile_otp_password_reset"
    await invalidate_driver_mobile_challenges(
        session,
        driver_id=driver.id,
        except_challenge_id=challenge.id,
    )
    await write_audit_log(
        session,
        actor_user_id=user.id,
        action="driver.mobile_password_reset_completed",
        resource_type="driver_mobile_password_reset_challenge",
        resource_public_id=challenge.id,
        ip_address=request_ip(request),
        new_values={"claim_status": driver.claim_status.value},
    )
    await session.commit()
    return DriverMobilePasswordResetResult(
        driver_id=driver.id,
        driver_name=driver.full_name,
        username=await get_driver_username(session, driver),
        mobile=driver.phone,
        must_change_password=False,
        message="Mobile verified and driver password reset successfully",
    )
