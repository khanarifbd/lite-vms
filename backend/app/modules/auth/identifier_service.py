import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import IdentifierType
from app.modules.auth.identifier_schema import normalize_identifier_value
from app.modules.auth.model import UserIdentifier
from app.modules.auth.service import (
    get_identifier,
    mask_email,
    mask_mobile,
    mask_username,
)


class IdentifierManagementError(ValueError):
    pass


def masked_identifier_value(identifier_type: IdentifierType, value: str) -> str:
    if identifier_type == IdentifierType.EMAIL:
        return mask_email(value)
    if identifier_type == IdentifierType.MOBILE:
        return mask_mobile(value)
    return mask_username(value)


async def get_user_identifier_by_public_id(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_public_id: uuid.UUID,
) -> UserIdentifier | None:
    return await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.public_id == identifier_public_id,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def get_active_user_identifier_by_type(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_type: IdentifierType,
) -> UserIdentifier | None:
    return await session.scalar(
        select(UserIdentifier).where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.disabled_at.is_(None),
        )
    )


async def set_primary_identifier(
    session: AsyncSession,
    *,
    user_id: int,
    identifier: UserIdentifier,
) -> None:
    if identifier.user_id != user_id or identifier.disabled_at is not None:
        raise IdentifierManagementError("Identifier is not active for this user")
    await session.execute(
        update(UserIdentifier)
        .where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.disabled_at.is_(None),
        )
        .values(is_primary=False)
    )
    identifier.is_primary = True
    await session.flush()


async def create_user_identifier(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_type: IdentifierType,
    value: str,
    make_primary: bool,
    verification_method: str,
) -> UserIdentifier:
    normalized = normalize_identifier_value(identifier_type, value)

    existing_type = await get_active_user_identifier_by_type(
        session,
        user_id=user_id,
        identifier_type=identifier_type,
    )
    if existing_type is not None:
        raise IdentifierManagementError(
            f"Only one active {identifier_type.value} identifier is allowed per user"
        )

    existing = await get_identifier(
        session,
        identifier_type=identifier_type,
        normalized_value=normalized,
    )
    if existing is not None:
        if existing.user_id == user_id:
            raise IdentifierManagementError("This identifier is already attached to the user")
        raise IdentifierManagementError(f"{identifier_type.value.title()} already registered")

    has_primary = await session.scalar(
        select(UserIdentifier.id).where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.is_primary.is_(True),
            UserIdentifier.disabled_at.is_(None),
        )
    )
    should_be_primary = make_primary or has_primary is None
    identifier = UserIdentifier(
        user_id=user_id,
        identifier_type=identifier_type,
        normalized_value=normalized,
        masked_value=masked_identifier_value(identifier_type, normalized),
        is_primary=False,
        is_verified=identifier_type == IdentifierType.USERNAME,
        verified_at=datetime.now(UTC) if identifier_type == IdentifierType.USERNAME else None,
        verification_method=(
            verification_method if identifier_type == IdentifierType.USERNAME else None
        ),
    )
    session.add(identifier)
    await session.flush()
    if should_be_primary:
        await set_primary_identifier(session, user_id=user_id, identifier=identifier)
    return identifier


async def update_user_identifier_value(
    session: AsyncSession,
    *,
    identifier: UserIdentifier,
    value: str,
    verification_method: str,
) -> None:
    normalized = normalize_identifier_value(identifier.identifier_type, value)
    if normalized == identifier.normalized_value:
        return
    existing = await get_identifier(
        session,
        identifier_type=identifier.identifier_type,
        normalized_value=normalized,
    )
    if existing is not None and existing.id != identifier.id:
        raise IdentifierManagementError(
            f"{identifier.identifier_type.value.title()} already registered"
        )

    identifier.normalized_value = normalized
    identifier.masked_value = masked_identifier_value(identifier.identifier_type, normalized)
    if identifier.identifier_type == IdentifierType.USERNAME:
        identifier.is_verified = True
        identifier.verified_at = datetime.now(UTC)
        identifier.verification_method = verification_method
    else:
        identifier.is_verified = False
        identifier.verified_at = None
        identifier.verification_method = None
    await session.flush()


async def disable_user_identifier(
    session: AsyncSession,
    *,
    user_id: int,
    identifier: UserIdentifier,
) -> None:
    active_identifiers = list(
        await session.scalars(
            select(UserIdentifier).where(
                UserIdentifier.user_id == user_id,
                UserIdentifier.disabled_at.is_(None),
            )
        )
    )
    if len(active_identifiers) <= 1:
        raise IdentifierManagementError("The final active login identifier cannot be removed")
    if identifier.is_primary:
        raise IdentifierManagementError(
            "Make another identifier primary before removing this identifier"
        )
    identifier.disabled_at = datetime.now(UTC)
    await session.flush()
