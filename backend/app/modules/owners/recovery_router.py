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
from app.modules.owners.enums import OwnerClaimStatus
from app.modules.owners.model import VehicleOwner
from app.modules.owners.recovery_model import OwnerMobilePasswordResetChallenge
from app.modules.owners.recovery_schema import (
    OwnerMobilePasswordResetConfirm,
    OwnerMobilePasswordResetRequest,
    OwnerMobilePasswordResetRequestResult,
    OwnerMobilePasswordResetResult,
)
from app.modules.owners.recovery_service import (
    as_utc,
    create_mobile_challenge,
    invalidate_active_mobile_challenges,
    latest_mobile_challenge,
    otp_matches,
)
from app.modules.owners.service import get_owner_by_identity, get_owner_username

router = APIRouter(
    prefix="/owners/password-reset/mobile",
    tags=["Vehicle Owner Account Recovery"],
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post(
    "/request",
    response_model=OwnerMobilePasswordResetRequestResult,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_owner_mobile_password_reset(
    payload: OwnerMobilePasswordResetRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerMobilePasswordResetRequestResult:
    owner = await get_owner_by_identity(
        session,
        payload.identity_or_registration_reference,
    )
    if (
        owner is None
        or owner.primary_admin_user_id is None
        or owner.phone is None
        or owner.phone != payload.mobile
    ):
        raise HTTPException(
            status_code=400,
            detail="The NID or registered mobile number does not match",
        )

    mobile_identifier = await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.user_id == owner.primary_admin_user_id,
            UserIdentifier.identifier_type == IdentifierType.MOBILE,
            UserIdentifier.normalized_value == payload.mobile,
            UserIdentifier.disabled_at.is_(None),
        )
    )
    if mobile_identifier is None:
        raise HTTPException(
            status_code=409,
            detail="The owner account does not have this mobile login identifier",
        )

    now = datetime.now(UTC)
    latest = await latest_mobile_challenge(session, owner_id=owner.id)
    if latest is not None:
        available_at = as_utc(latest.created_at) + timedelta(
            seconds=settings.owner_password_reset_otp_cooldown_seconds
        )
        if available_at > now:
            retry_after = max(1, int((available_at - now).total_seconds()))
            raise HTTPException(
                status_code=429,
                detail={
                    "message": "Please wait before requesting another OTP",
                    "retry_after_seconds": retry_after,
                },
            )

    challenge, otp = await create_mobile_challenge(
        session,
        owner_id=owner.id,
        user_id=owner.primary_admin_user_id,
        normalized_mobile=payload.mobile,
        requested_ip=request_ip(request),
    )
    message = (
        f"আপনার {settings.app_name} পাসওয়ার্ড রিসেট OTP: {otp}. "
        f"এটি {settings.owner_password_reset_otp_expire_minutes} মিনিটের মধ্যে ব্যবহার করুন।"
    )
    try:
        delivery_status = await send_sms(mobile=payload.mobile, message=message)
    except SMSDeliveryError as exc:
        await session.rollback()
        raise HTTPException(status_code=503, detail=str(exc)) from None

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        action="vehicle_owner.mobile_password_reset_requested",
        resource_type="owner_mobile_password_reset_challenge",
        resource_public_id=challenge.id,
        ip_address=request_ip(request),
        new_values={"delivery_status": delivery_status},
    )
    await session.commit()
    await session.refresh(challenge)

    expose_otp = settings.app_env.strip().lower() in {"development", "testing"}
    return OwnerMobilePasswordResetRequestResult(
        challenge_id=challenge.id,
        phone=payload.mobile,
        expires_in_seconds=settings.owner_password_reset_otp_expire_minutes * 60,
        delivery_status=delivery_status,
        development_otp=otp if expose_otp else None,
        message="OTP sent to the registered mobile number",
    )


@router.post("/confirm", response_model=OwnerMobilePasswordResetResult)
async def confirm_owner_mobile_password_reset(
    payload: OwnerMobilePasswordResetConfirm,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerMobilePasswordResetResult:
    challenge = await session.get(OwnerMobilePasswordResetChallenge, payload.challenge_id)
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

    owner = await session.get(VehicleOwner, challenge.owner_id)
    user = await session.get(User, challenge.user_id)
    if owner is None or user is None or owner.primary_admin_user_id != challenge.user_id:
        raise HTTPException(status_code=409, detail="Owner account relationship is invalid")

    security = await get_security(session, challenge.user_id)
    if security is None:
        raise HTTPException(status_code=409, detail="Owner security record is missing")
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
    owner.claim_status = OwnerClaimStatus.CLAIMED
    challenge.consumed_at = now
    mobile_identifier.is_verified = True
    mobile_identifier.verified_at = now
    mobile_identifier.verification_method = "mobile_otp_password_reset"
    await invalidate_active_mobile_challenges(
        session,
        owner_id=owner.id,
        except_challenge_id=challenge.id,
    )
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=user.id,
        action="vehicle_owner.mobile_password_reset_completed",
        resource_type="owner_mobile_password_reset_challenge",
        resource_public_id=challenge.id,
        ip_address=request_ip(request),
        new_values={"claim_status": owner.claim_status.value},
    )
    await session.commit()

    return OwnerMobilePasswordResetResult(
        owner_id=owner.id,
        owner_name=owner.name,
        username=await get_owner_username(session, owner),
        phone=owner.phone or challenge.normalized_mobile,
        must_change_password=False,
        message="Mobile verified and password reset successfully",
    )
