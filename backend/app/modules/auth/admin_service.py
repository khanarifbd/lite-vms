from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.admin_schema import IdentifierAdminRead, UserAdminRead
from app.modules.auth.model import User, UserIdentifier
from app.modules.auth.service import build_user_read


async def build_user_admin_read(
    session: AsyncSession,
    user: User,
) -> UserAdminRead:
    user_read = await build_user_read(session, user)
    identifiers = list(
        await session.scalars(
            select(UserIdentifier)
            .where(
                UserIdentifier.user_id == user.id,
                UserIdentifier.disabled_at.is_(None),
            )
            .order_by(UserIdentifier.is_primary.desc(), UserIdentifier.created_at)
        )
    )
    payload = user_read.model_dump()
    payload["identifiers"] = [
        IdentifierAdminRead(
            public_id=identifier.public_id,
            identifier_type=identifier.identifier_type,
            value=identifier.normalized_value,
            masked_value=identifier.masked_value,
            is_primary=identifier.is_primary,
            is_verified=identifier.is_verified,
            verified_at=identifier.verified_at,
        )
        for identifier in identifiers
    ]
    return UserAdminRead.model_validate(payload)
