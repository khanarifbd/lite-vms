from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.model import AuditLog
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverVerificationStatus
from app.modules.drivers.model import Driver
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.settings.monitoring_service import (
    read_monitoring_settings,
    save_monitoring_settings,
)
from app.modules.settings.schema import (
    AuditLogItem,
    AuditLogPage,
    MonitoringSettings,
    SystemSettingsRead,
    SystemSettingsUpdate,
)
from app.modules.settings.service import (
    SETTINGS_ACTION,
    auto_approve_driver,
    auto_approve_owner,
    auto_approve_provider,
    auto_approve_vehicle,
    read_settings,
)
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/settings", tags=["Admin Settings & Audit"])


async def complete_system_settings(session: AsyncSession) -> SystemSettingsRead:
    settings = await read_settings(session)
    monitoring = await read_monitoring_settings(session)
    return settings.model_copy(update={"monitoring": monitoring})


@router.get("", response_model=SystemSettingsRead)
async def get_system_settings(
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SystemSettingsRead:
    return await complete_system_settings(session)


@router.get("/monitoring", response_model=MonitoringSettings)
async def get_monitoring_settings(
    _: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MonitoringSettings:
    return await read_monitoring_settings(session)


@router.put("", response_model=SystemSettingsRead)
async def update_system_settings(
    payload: SystemSettingsUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SystemSettingsRead:
    previous = (await complete_system_settings(session)).model_dump(
        mode="json",
        exclude={"updated_at"},
    )
    current = payload.model_dump(exclude={"reason"}, mode="json")

    await save_monitoring_settings(session, payload.monitoring)
    await write_audit_log(
        session,
        tenant_id=None,
        actor_user_id=actor.id,
        action=SETTINGS_ACTION,
        resource_type="system_configuration",
        resource_public_id=None,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        previous_values=previous,
        new_values=current,
        reason=payload.reason,
    )

    # Re-evaluate existing completed pending submissions immediately using the
    # newly saved rules. Each domain service still validates required fields,
    # documents, expiry dates, and the entity's current workflow state.
    pending_providers = list(
        await session.scalars(
            select(VTSProvider).where(
                VTSProvider.status.in_([ProviderStatus.PENDING, ProviderStatus.UNDER_REVIEW])
            )
        )
    )
    for provider in pending_providers:
        await auto_approve_provider(session, provider)

    pending_owners = list(
        await session.scalars(
            select(VehicleOwner).where(
                VehicleOwner.verification_status.in_(
                    [OwnerVerificationStatus.PENDING, OwnerVerificationStatus.UNDER_REVIEW]
                )
            )
        )
    )
    for owner in pending_owners:
        await auto_approve_owner(session, owner)

    pending_vehicles = list(
        await session.scalars(
            select(Vehicle).where(
                Vehicle.verification_status.in_(
                    [
                        VehicleVerificationStatus.PENDING_VERIFICATION,
                        VehicleVerificationStatus.UNDER_REVIEW,
                    ]
                )
            )
        )
    )
    for vehicle in pending_vehicles:
        await auto_approve_vehicle(session, vehicle)

    pending_drivers = list(
        await session.scalars(
            select(Driver).where(
                Driver.verification_status.in_(
                    [
                        DriverVerificationStatus.PENDING,
                        DriverVerificationStatus.UNDER_REVIEW,
                    ]
                )
            )
        )
    )
    for driver in pending_drivers:
        await auto_approve_driver(session, driver)

    await session.commit()
    return await complete_system_settings(session)


@router.get("/audit-logs", response_model=AuditLogPage)
async def list_audit_logs(
    _: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
    search: Annotated[str | None, Query(max_length=180)] = None,
    action: Annotated[str | None, Query(max_length=120)] = None,
    resource_type: Annotated[str | None, Query(max_length=120)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditLogPage:
    actor_name = (
        select(User.display_name)
        .where(User.id == AuditLog.actor_user_id)
        .correlate(AuditLog)
        .scalar_subquery()
    )
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.where(
            func.lower(AuditLog.action).like(pattern)
            | func.lower(AuditLog.resource_type).like(pattern)
            | func.lower(func.coalesce(AuditLog.reason, "")).like(pattern)
        )

    total = int(await session.scalar(select(func.count()).select_from(query.subquery())) or 0)
    rows = (
        await session.execute(
            query.with_only_columns(
                AuditLog.public_id.label("id"),
                AuditLog.action,
                AuditLog.resource_type,
                AuditLog.resource_public_id,
                actor_name.label("actor_name"),
                AuditLog.reason,
                AuditLog.previous_values,
                AuditLog.new_values,
                AuditLog.created_at,
            )
            .order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return AuditLogPage(
        items=[
            AuditLogItem(
                id=str(row.id),
                action=row.action,
                resource_type=row.resource_type,
                resource_public_id=(
                    str(row.resource_public_id) if row.resource_public_id is not None else None
                ),
                actor_name=row.actor_name,
                reason=row.reason,
                previous_values=row.previous_values,
                new_values=row.new_values,
                created_at=row.created_at,
            )
            for row in rows
        ],
        total=total,
        offset=offset,
        limit=limit,
    )
