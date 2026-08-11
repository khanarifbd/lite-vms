import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.drivers.recovery_model import DriverMobilePasswordResetChallenge
from app.modules.owners.recovery_service import generate_otp, otp_digest


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def latest_driver_mobile_challenge(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
) -> DriverMobilePasswordResetChallenge | None:
    return await session.scalar(
        select(DriverMobilePasswordResetChallenge)
        .where(DriverMobilePasswordResetChallenge.driver_id == driver_id)
        .order_by(DriverMobilePasswordResetChallenge.created_at.desc())
        .limit(1)
    )


async def invalidate_driver_mobile_challenges(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
    except_challenge_id: uuid.UUID | None = None,
) -> None:
    now = datetime.now(UTC)
    challenges = list(
        await session.scalars(
            select(DriverMobilePasswordResetChallenge).where(
                DriverMobilePasswordResetChallenge.driver_id == driver_id,
                DriverMobilePasswordResetChallenge.consumed_at.is_(None),
                DriverMobilePasswordResetChallenge.invalidated_at.is_(None),
            )
        )
    )
    for challenge in challenges:
        if except_challenge_id is not None and challenge.id == except_challenge_id:
            continue
        challenge.invalidated_at = now


async def create_driver_mobile_challenge(
    session: AsyncSession,
    *,
    driver_id: uuid.UUID,
    user_id: int,
    normalized_mobile: str,
    requested_ip: str | None,
) -> tuple[DriverMobilePasswordResetChallenge, str]:
    await invalidate_driver_mobile_challenges(session, driver_id=driver_id)
    otp = generate_otp()
    challenge = DriverMobilePasswordResetChallenge(
        driver_id=driver_id,
        user_id=user_id,
        normalized_mobile=normalized_mobile,
        otp_digest="",
        expires_at=datetime.now(UTC)
        + timedelta(minutes=settings.owner_password_reset_otp_expire_minutes),
        max_attempts=settings.owner_password_reset_otp_max_attempts,
        requested_ip=requested_ip,
    )
    session.add(challenge)
    await session.flush()
    challenge.otp_digest = otp_digest(challenge_id=challenge.id, otp=otp)
    await session.flush()
    return challenge, otp
