from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ProviderStatus, UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.providers.schema import ProviderApplicationRead
from app.modules.providers.service import (
    build_provider_read,
    get_provider_for_user,
    replace_allowed_ips,
)
from app.modules.providers.workspace_schema import ProviderWorkspaceSettingsUpdate
from app.modules.tracking.service import get_or_create_provider_source

router = APIRouter(prefix="/providers/me", tags=["VTS Provider Workspace"])

workspace_roles = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.get("/integration", response_model=ProviderApplicationRead)
async def read_my_provider_integration(
    actor: Annotated[User, Depends(require_roles(*workspace_roles))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="VTS provider must be approved first")

    await get_or_create_provider_source(session, provider)
    if not provider.integration_status:
        provider.integration_status = "not_configured"
    await session.commit()
    await session.refresh(provider)
    return await build_provider_read(session, provider)


@router.patch("/settings", response_model=ProviderApplicationRead)
async def update_my_provider_settings(
    payload: ProviderWorkspaceSettingsUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VTS_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail="Operational settings are available only after provider approval",
        )

    await get_or_create_provider_source(session, provider)
    allowed_ips = payload.allowed_server_ips
    changes = payload.model_dump(exclude_unset=True, exclude={"allowed_server_ips"})
    field_map = {"technical_contact_mobile": "technical_contact_phone"}
    for field, value in changes.items():
        setattr(provider, field_map.get(field, field), value)

    if allowed_ips is not None:
        await replace_allowed_ips(
            session,
            provider_id=provider.id,
            ip_addresses=allowed_ips,
        )

    if provider.last_telemetry_received_at is not None:
        provider.integration_status = "connected"
    elif provider.supported_protocols and provider.data_submission_interval_seconds:
        provider.integration_status = "configured"
    else:
        provider.integration_status = "not_configured"

    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action="vts_provider.workspace_settings_updated",
        resource_type="vts_provider",
        resource_public_id=provider.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values=payload.model_dump(exclude_unset=True, mode="json"),
    )
    await session.commit()
    await session.refresh(provider)
    return await build_provider_read(session, provider)
