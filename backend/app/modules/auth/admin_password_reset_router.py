import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.auth.schema import MessageResponse, PasswordReset
from app.modules.auth.service import change_password
from app.modules.drivers.model import Driver
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider

router = APIRouter(prefix="/admin/accounts", tags=["Admin Account Support"])

AccountEntity = Literal["provider", "owner", "driver"]


async def resolve_account_user(
    session: AsyncSession,
    *,
    entity_type: AccountEntity,
    entity_id: uuid.UUID,
) -> tuple[User, str, uuid.UUID]:
    user_id: int | None
    resource_type: str

    if entity_type == "provider":
        entity = await session.get(VTSProvider, entity_id)
        if entity is None:
            raise HTTPException(status_code=404, detail="VTS provider not found")
        user_id = entity.primary_admin_user_id
        resource_type = "vts_provider"
    elif entity_type == "owner":
        entity = await session.get(VehicleOwner, entity_id)
        if entity is None:
            raise HTTPException(status_code=404, detail="Vehicle owner not found")
        user_id = entity.primary_admin_user_id
        resource_type = "vehicle_owner"
    else:
        entity = await session.get(Driver, entity_id)
        if entity is None:
            raise HTTPException(status_code=404, detail="Driver not found")
        user_id = entity.user_id
        resource_type = "driver"

    if user_id is None:
        raise HTTPException(status_code=409, detail="The account identity is not linked")

    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=409, detail="The linked user account is unavailable")

    return user, resource_type, entity_id


@router.post(
    "/{entity_type}/{entity_id}/reset-password",
    response_model=MessageResponse,
)
async def reset_entity_password(
    entity_type: AccountEntity,
    entity_id: uuid.UUID,
    payload: PasswordReset,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MessageResponse:
    user, resource_type, resource_id = await resolve_account_user(
        session,
        entity_type=entity_type,
        entity_id=entity_id,
    )

    await change_password(
        session,
        user=user,
        new_password=payload.new_password,
        must_change_password=True,
    )
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action=f"{resource_type}.temporary_password_issued",
        resource_type=resource_type,
        resource_public_id=resource_id,
        reason=payload.reason,
        new_values={
            "user_public_id": str(user.public_id),
            "must_change_password": True,
        },
    )
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="user.password_reset",
        resource_type="user",
        resource_public_id=user.public_id,
        reason=payload.reason,
        new_values={"must_change_password": True, "source": "support_reset"},
    )
    await session.commit()

    return MessageResponse(
        message=(
            "Temporary password issued; existing sessions were revoked and the user must "
            "set a new password after signing in"
        )
    )
