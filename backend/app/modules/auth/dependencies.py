import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole, UserStatus
from app.core.config import settings
from app.core.database import get_session
from app.modules.auth.model import User, UserSecurity, UserSession
from app.modules.auth.security import decode_access_token
from app.modules.auth.service import get_user_by_public_id
from app.modules.iam.service import (
    get_active_permission_codes_for_user,
    get_active_role_codes_for_user,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_public_id = uuid.UUID(str(payload["sub"]))
        session_jti = uuid.UUID(str(payload["jti"]))
        token_version = int(payload["ver"])
    except (jwt.InvalidTokenError, ValueError, KeyError, TypeError):
        raise credentials_error from None

    user = await get_user_by_public_id(session, user_public_id)
    if user is None or user.deleted_at is not None:
        raise credentials_error
    security = await session.scalar(select(UserSecurity).where(UserSecurity.user_id == user.id))
    login_session = await session.scalar(
        select(UserSession).where(
            UserSession.token_jti == session_jti,
            UserSession.user_id == user.id,
        )
    )
    now = datetime.now(UTC)
    if (
        security is None
        or security.token_version != token_version
        or login_session is None
        or login_session.revoked_at is not None
        or as_utc(login_session.expires_at) <= now
        or login_session.token_version != token_version
    ):
        raise credentials_error

    user._role_codes = await get_active_role_codes_for_user(session, user.id)
    user._permission_codes = await get_active_permission_codes_for_user(session, user.id)
    user._session_jti = session_jti
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.status != UserStatus.ACTIVE or current_user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return current_user


def require_roles(*allowed_roles: UserRole | str) -> Callable[..., User]:
    allowed_codes = {
        role.value if isinstance(role, UserRole) else str(role).strip().lower()
        for role in allowed_roles
    }

    async def role_dependency(
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        role_codes = set(getattr(current_user, "_role_codes", set()))
        if not role_codes.intersection(allowed_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return role_dependency


def require_permissions(*required_permissions: str) -> Callable[..., User]:
    required = {permission.strip().lower() for permission in required_permissions}

    async def permission_dependency(
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        permissions = set(getattr(current_user, "_permission_codes", set()))
        if not required.issubset(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Required permission is missing",
            )
        return current_user

    return permission_dependency
