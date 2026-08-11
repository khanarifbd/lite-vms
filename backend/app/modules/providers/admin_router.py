import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OrganizationStatus,
    ProviderStatus,
    TelemetrySourceStatus,
    TenantStatus,
    UserRole,
    UserStatus,
)
from app.core.database import get_session
from app.modules.audit.history import build_audit_history
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.auth.service import get_security, revoke_all_sessions
from app.modules.iam.model import Organization, Tenant
from app.modules.providers.admin_schema import (
    AdminProviderDetail,
    AdminProviderStatusResult,
    AdminProviderStatusUpdate,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.schema import ProviderApplicationRead, ProviderPage
from app.modules.providers.service import build_provider_read, get_provider_by_id
from app.modules.tracking.model import TelemetrySource

router = APIRouter(prefix="/admin/providers", tags=["Admin VTS Provider Review"])

ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)
ACCOUNT_HISTORY_ACTIONS = (
    "vts_provider.account_activated",
    "vts_provider.account_locked",
    "vts_provider.account_suspended",
    "vts_provider.account_reactivate",
    "vts_provider.account_suspend",
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def build_admin_provider_detail(
    session: AsyncSession,
    provider: VTSProvider,
) -> AdminProviderDetail:
    if provider.primary_admin_user_id is None:
        raise HTTPException(status_code=409, detail="Provider primary admin account is missing")
    admin = await session.get(User, provider.primary_admin_user_id)
    if admin is None:
        raise HTTPException(status_code=409, detail="Provider primary admin account is missing")
    history = await build_audit_history(
        session,
        resource_type="vts_provider",
        resource_public_id=provider.id,
        actions=ACCOUNT_HISTORY_ACTIONS,
    )
    return AdminProviderDetail(
        provider=await build_provider_read(session, provider),
        account_status=admin.status,
        last_administrative_reason=history[0].reason if history else None,
        history=history,
    )


@router.get("", response_model=ProviderPage)
async def list_admin_providers(
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    provider_status: Annotated[ProviderStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> ProviderPage:
    query = select(VTSProvider)
    count_query = select(func.count(VTSProvider.id))
    if provider_status is not None:
        query = query.where(VTSProvider.status == provider_status)
        count_query = count_query.where(VTSProvider.status == provider_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(VTSProvider.name).like(pattern),
            func.lower(VTSProvider.code).like(pattern),
            func.lower(VTSProvider.application_number).like(pattern),
            func.lower(VTSProvider.license_number).like(pattern),
            func.lower(VTSProvider.email).like(pattern),
            func.lower(VTSProvider.phone).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    providers = list(
        await session.scalars(
            query.order_by(VTSProvider.updated_at.desc()).offset(offset).limit(limit)
        )
    )
    return ProviderPage(
        items=[await build_provider_read(session, provider) for provider in providers],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/{provider_id}/account-detail", response_model=AdminProviderDetail)
async def read_admin_provider_account_detail(
    provider_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminProviderDetail:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    return await build_admin_provider_detail(session, provider)


@router.get("/{provider_id}", response_model=ProviderApplicationRead)
async def read_admin_provider(
    provider_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    return await build_provider_read(session, provider)


@router.post("/{provider_id}/account-status", response_model=AdminProviderStatusResult)
async def update_provider_account_status(
    provider_id: uuid.UUID,
    payload: AdminProviderStatusUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminProviderStatusResult:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    if (
        provider.tenant_id is None
        or provider.root_organization_id is None
        or provider.primary_admin_user_id is None
    ):
        raise HTTPException(status_code=409, detail="Provider identity scope is incomplete")

    tenant = await session.get(Tenant, provider.tenant_id)
    organization = await session.get(Organization, provider.root_organization_id)
    admin = await session.get(User, provider.primary_admin_user_id)
    if tenant is None or organization is None or admin is None:
        raise HTTPException(status_code=409, detail="Provider identity scope is missing")
    security = await get_security(session, admin.id)
    if security is None:
        raise HTTPException(status_code=409, detail="Provider admin security record is missing")
    if admin.status not in {UserStatus.ACTIVE, UserStatus.LOCKED, UserStatus.SUSPENDED}:
        raise HTTPException(
            status_code=409,
            detail=f"Provider account cannot be changed from {admin.status.value}",
        )

    source = await session.scalar(
        select(TelemetrySource).where(TelemetrySource.provider_id == provider.id)
    )
    action = "activate" if payload.action == "reactivate" else payload.action
    previous_values = {
        "account_status": admin.status.value,
        "provider_status": provider.status.value,
        "tenant_status": tenant.status.value,
        "organization_status": organization.status.value,
        "telemetry_source_status": source.status.value if source is not None else None,
    }
    now = datetime.now(UTC)

    if action == "lock":
        if provider.status != ProviderStatus.APPROVED:
            raise HTTPException(
                status_code=409,
                detail="Only approved providers can be locked",
            )
        if admin.status == UserStatus.LOCKED:
            raise HTTPException(status_code=409, detail="Provider account is already locked")
        if admin.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=409,
                detail="Activate the provider account before locking it",
            )
        admin.status = UserStatus.LOCKED
        message = "VTS provider account locked"
    elif action == "suspend":
        if provider.status == ProviderStatus.SUSPENDED:
            raise HTTPException(status_code=409, detail="Provider is already suspended")
        if provider.status != ProviderStatus.APPROVED:
            raise HTTPException(
                status_code=409,
                detail="Only approved providers can be suspended",
            )
        provider.status = ProviderStatus.SUSPENDED
        tenant.status = TenantStatus.SUSPENDED
        organization.status = OrganizationStatus.SUSPENDED
        admin.status = UserStatus.SUSPENDED
        if source is not None:
            source.status = TelemetrySourceStatus.SUSPENDED
            source.suspended_at = now
            source.status_reason = payload.reason
        message = "VTS provider account suspended"
    else:
        provider_was_suspended = provider.status == ProviderStatus.SUSPENDED
        account_was_restricted = admin.status in {UserStatus.LOCKED, UserStatus.SUSPENDED}
        if not provider_was_suspended and not account_was_restricted:
            raise HTTPException(status_code=409, detail="Provider account is already active")
        if provider.status not in {ProviderStatus.APPROVED, ProviderStatus.SUSPENDED}:
            raise HTTPException(
                status_code=409,
                detail=f"Provider cannot be activated from {provider.status.value}",
            )
        provider.status = ProviderStatus.APPROVED
        tenant.status = TenantStatus.ACTIVE
        organization.status = OrganizationStatus.ACTIVE
        admin.status = UserStatus.ACTIVE
        if source is not None and provider_was_suspended:
            source.status = TelemetrySourceStatus.ACTIVE
            source.suspended_at = None
            source.status_reason = payload.reason
            if source.approved_at is None:
                source.approved_at = now
            if source.approved_by_id is None:
                source.approved_by_id = actor.id
        message = "VTS provider account activated"

    admin.updated_by_id = actor.id
    security.failed_login_count = 0
    security.locked_until = None
    security.token_version += 1
    await revoke_all_sessions(session, admin.id)

    audit_action = {
        "activate": "vts_provider.account_activated",
        "lock": "vts_provider.account_locked",
        "suspend": "vts_provider.account_suspended",
    }[action]
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action=audit_action,
        resource_type="vts_provider",
        resource_public_id=provider.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values=previous_values,
        new_values={
            "account_status": admin.status.value,
            "provider_status": provider.status.value,
            "tenant_status": tenant.status.value,
            "organization_status": organization.status.value,
            "telemetry_source_status": source.status.value if source is not None else None,
            "reason": payload.reason,
        },
        reason=payload.reason,
    )
    await session.commit()
    await session.refresh(provider)
    return AdminProviderStatusResult(
        provider=await build_provider_read(session, provider),
        message=message,
    )
