import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.admin_schema import UserAdminRead
from app.modules.auth.admin_service import build_user_admin_read
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.identifier_schema import IdentifierCreate, IdentifierUpdate
from app.modules.auth.identifier_service import (
    IdentifierManagementError,
    create_user_identifier,
    disable_user_identifier,
    get_user_identifier_by_public_id,
    set_primary_identifier,
    update_user_identifier_value,
)
from app.modules.auth.model import User
from app.modules.auth.schema import UserRead
from app.modules.auth.service import build_user_read, get_user_by_public_id

router = APIRouter(prefix="/auth", tags=["User Login Identifiers"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def managed_user_or_404(
    session: AsyncSession,
    user_public_id: uuid.UUID,
) -> User:
    user = await get_user_by_public_id(session, user_public_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def apply_identifier_create(
    *,
    session: AsyncSession,
    target_user: User,
    actor: User,
    payload: IdentifierCreate,
    request: Request,
) -> UserRead:
    try:
        identifier = await create_user_identifier(
            session,
            user_id=target_user.id,
            identifier_type=payload.identifier_type,
            value=payload.value,
            make_primary=payload.make_primary,
            verification_method=(
                "assigned_by_super_admin" if actor.id != target_user.id else "self_selected"
            ),
        )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="user.identifier_added",
            resource_type="user_identifier",
            resource_public_id=identifier.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "user_public_id": str(target_user.public_id),
                "identifier_type": identifier.identifier_type.value,
                "is_primary": identifier.is_primary,
            },
        )
        await session.commit()
    except (IdentifierManagementError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_read(session, target_user)


async def apply_identifier_update(
    *,
    session: AsyncSession,
    target_user: User,
    actor: User,
    identifier_public_id: uuid.UUID,
    payload: IdentifierUpdate,
    request: Request,
) -> UserRead:
    identifier = await get_user_identifier_by_public_id(
        session,
        user_id=target_user.id,
        identifier_public_id=identifier_public_id,
    )
    if identifier is None:
        raise HTTPException(status_code=404, detail="Identifier not found")
    previous = {
        "masked_value": identifier.masked_value,
        "is_verified": identifier.is_verified,
    }
    try:
        await update_user_identifier_value(
            session,
            identifier=identifier,
            value=payload.value,
            verification_method=(
                "assigned_by_super_admin" if actor.id != target_user.id else "self_selected"
            ),
        )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="user.identifier_updated",
            resource_type="user_identifier",
            resource_public_id=identifier.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values=previous,
            new_values={
                "masked_value": identifier.masked_value,
                "is_verified": identifier.is_verified,
            },
        )
        await session.commit()
    except (IdentifierManagementError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_read(session, target_user)


async def apply_make_primary(
    *,
    session: AsyncSession,
    target_user: User,
    actor: User,
    identifier_public_id: uuid.UUID,
    request: Request,
) -> UserRead:
    identifier = await get_user_identifier_by_public_id(
        session,
        user_id=target_user.id,
        identifier_public_id=identifier_public_id,
    )
    if identifier is None:
        raise HTTPException(status_code=404, detail="Identifier not found")
    previous_primary = next(
        (
            item
            for item in (await build_user_read(session, target_user)).identifiers
            if item.is_primary
        ),
        None,
    )
    try:
        await set_primary_identifier(
            session,
            user_id=target_user.id,
            identifier=identifier,
        )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="user.identifier_made_primary",
            resource_type="user_identifier",
            resource_public_id=identifier.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={
                "primary_identifier_public_id": (
                    str(previous_primary.public_id) if previous_primary else None
                )
            },
            new_values={
                "primary_identifier_public_id": str(identifier.public_id),
                "identifier_type": identifier.identifier_type.value,
            },
        )
        await session.commit()
    except (IdentifierManagementError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_read(session, target_user)


async def apply_identifier_delete(
    *,
    session: AsyncSession,
    target_user: User,
    actor: User,
    identifier_public_id: uuid.UUID,
    request: Request,
) -> UserRead:
    identifier = await get_user_identifier_by_public_id(
        session,
        user_id=target_user.id,
        identifier_public_id=identifier_public_id,
    )
    if identifier is None:
        raise HTTPException(status_code=404, detail="Identifier not found")
    try:
        await disable_user_identifier(
            session,
            user_id=target_user.id,
            identifier=identifier,
        )
        await write_audit_log(
            session,
            actor_user_id=actor.id,
            action="user.identifier_disabled",
            resource_type="user_identifier",
            resource_public_id=identifier.public_id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={
                "identifier_type": identifier.identifier_type.value,
                "masked_value": identifier.masked_value,
            },
        )
        await session.commit()
    except (IdentifierManagementError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None
    return await build_user_read(session, target_user)


@router.post(
    "/me/identifiers",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_my_identifier(
    payload: IdentifierCreate,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    return await apply_identifier_create(
        session=session,
        target_user=actor,
        actor=actor,
        payload=payload,
        request=request,
    )


@router.patch("/me/identifiers/{identifier_public_id}", response_model=UserRead)
async def update_my_identifier(
    identifier_public_id: uuid.UUID,
    payload: IdentifierUpdate,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    return await apply_identifier_update(
        session=session,
        target_user=actor,
        actor=actor,
        identifier_public_id=identifier_public_id,
        payload=payload,
        request=request,
    )


@router.post(
    "/me/identifiers/{identifier_public_id}/make-primary",
    response_model=UserRead,
)
async def make_my_identifier_primary(
    identifier_public_id: uuid.UUID,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    return await apply_make_primary(
        session=session,
        target_user=actor,
        actor=actor,
        identifier_public_id=identifier_public_id,
        request=request,
    )


@router.delete("/me/identifiers/{identifier_public_id}", response_model=UserRead)
async def remove_my_identifier(
    identifier_public_id: uuid.UUID,
    request: Request,
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRead:
    return await apply_identifier_delete(
        session=session,
        target_user=actor,
        actor=actor,
        identifier_public_id=identifier_public_id,
        request=request,
    )


@router.post(
    "/users/{user_public_id}/identifiers",
    response_model=UserAdminRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_managed_identifier(
    user_public_id: uuid.UUID,
    payload: IdentifierCreate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    target_user = await managed_user_or_404(session, user_public_id)
    await apply_identifier_create(
        session=session,
        target_user=target_user,
        actor=actor,
        payload=payload,
        request=request,
    )
    return await build_user_admin_read(session, target_user)


@router.patch(
    "/users/{user_public_id}/identifiers/{identifier_public_id}",
    response_model=UserAdminRead,
)
async def update_managed_identifier(
    user_public_id: uuid.UUID,
    identifier_public_id: uuid.UUID,
    payload: IdentifierUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    target_user = await managed_user_or_404(session, user_public_id)
    await apply_identifier_update(
        session=session,
        target_user=target_user,
        actor=actor,
        identifier_public_id=identifier_public_id,
        payload=payload,
        request=request,
    )
    return await build_user_admin_read(session, target_user)


@router.post(
    "/users/{user_public_id}/identifiers/{identifier_public_id}/make-primary",
    response_model=UserAdminRead,
)
async def make_managed_identifier_primary(
    user_public_id: uuid.UUID,
    identifier_public_id: uuid.UUID,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    target_user = await managed_user_or_404(session, user_public_id)
    await apply_make_primary(
        session=session,
        target_user=target_user,
        actor=actor,
        identifier_public_id=identifier_public_id,
        request=request,
    )
    return await build_user_admin_read(session, target_user)


@router.delete(
    "/users/{user_public_id}/identifiers/{identifier_public_id}",
    response_model=UserAdminRead,
)
async def remove_managed_identifier(
    user_public_id: uuid.UUID,
    identifier_public_id: uuid.UUID,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserAdminRead:
    target_user = await managed_user_or_404(session, user_public_id)
    await apply_identifier_delete(
        session=session,
        target_user=target_user,
        actor=actor,
        identifier_public_id=identifier_public_id,
        request=request,
    )
    return await build_user_admin_read(session, target_user)
