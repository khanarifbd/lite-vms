import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.owners.recovery_model import OwnerMobilePasswordResetChallenge


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_digest(*, challenge_id: uuid.UUID, otp: str) -> str:
    message = f"{challenge_id}:{otp}".encode()
    return hmac.new(
        settings.jwt_secret_key.encode(),
        message,
        hashlib.sha256,
    ).hexdigest()


def otp_matches(*, challenge_id: uuid.UUID, otp: str, expected_digest: str) -> bool:
    actual = otp_digest(challenge_id=challenge_id, otp=otp)
    return hmac.compare_digest(actual, expected_digest)


async def latest_mobile_challenge(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
) -> OwnerMobilePasswordResetChallenge | None:
    return await session.scalar(
        select(OwnerMobilePasswordResetChallenge)
        .where(OwnerMobilePasswordResetChallenge.owner_id == owner_id)
        .order_by(OwnerMobilePasswordResetChallenge.created_at.desc())
        .limit(1)
    )


async def invalidate_active_mobile_challenges(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    except_challenge_id: uuid.UUID | None = None,
) -> None:
    now = datetime.now(UTC)
    challenges = list(
        await session.scalars(
            select(OwnerMobilePasswordResetChallenge).where(
                OwnerMobilePasswordResetChallenge.owner_id == owner_id,
                OwnerMobilePasswordResetChallenge.consumed_at.is_(None),
                OwnerMobilePasswordResetChallenge.invalidated_at.is_(None),
            )
        )
    )
    for challenge in challenges:
        if except_challenge_id is not None and challenge.id == except_challenge_id:
            continue
        challenge.invalidated_at = now


async def create_mobile_challenge(
    session: AsyncSession,
    *,
    owner_id: uuid.UUID,
    user_id: int,
    normalized_mobile: str,
    requested_ip: str | None,
) -> tuple[OwnerMobilePasswordResetChallenge, str]:
    await invalidate_active_mobile_challenges(session, owner_id=owner_id)
    otp = generate_otp()
    challenge = OwnerMobilePasswordResetChallenge(
        owner_id=owner_id,
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
