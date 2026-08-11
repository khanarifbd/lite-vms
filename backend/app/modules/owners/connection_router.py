import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ProviderStatus, TrackingAssignmentStatus, UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.owners.connection_schema import (
    OwnerConnectionVehicleRead,
    OwnerProviderConnectionDecision,
    OwnerProviderConnectionEnd,
    OwnerProviderConnectionRead,
    OwnerProviderConnectionRequest,
    OwnerProviderConnectionStats,
    OwnerProviderConnectionWorkspace,
    OwnerProviderDirectoryItem,
    OwnerProviderVehicleScopeUpdate,
)
from app.modules.owners.enums import (
    OwnerProviderLinkDecision,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
    OwnerProviderVehicleScopeMode,
)
from app.modules.owners.model import (
    VehicleOwner,
    VTSProviderOwnerLink,
    VTSProviderOwnerVehicleAccess,
)
from app.modules.owners.service import (
    create_or_reopen_provider_owner_link,
    get_owner_for_user,
    get_provider_owner_link,
)
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(
    prefix="/owners/me/provider-connections",
    tags=["Vehicle Owner Provider Connections"],
)

VISIBLE_TRACKING_STATUSES = (
    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
    TrackingAssignmentStatus.TESTING,
    TrackingAssignmentStatus.ACTIVE,
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def require_owner(session: AsyncSession, actor: User) -> VehicleOwner:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    return owner


async def require_owner_link(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
    link_id: uuid.UUID,
) -> VTSProviderOwnerLink:
    link = await session.get(VTSProviderOwnerLink, link_id)
    if link is None or link.owner_id != owner.id:
        raise HTTPException(status_code=404, detail="Provider connection not found")
    return link


async def selected_vehicle_ids(
    session: AsyncSession,
    link_id: uuid.UUID,
) -> list[uuid.UUID]:
    return list(
        await session.scalars(
            select(VTSProviderOwnerVehicleAccess.vehicle_id)
            .where(
                VTSProviderOwnerVehicleAccess.link_id == link_id,
                VTSProviderOwnerVehicleAccess.is_active.is_(True),
            )
            .order_by(VTSProviderOwnerVehicleAccess.granted_at)
        )
    )


async def build_connection_read(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
    link: VTSProviderOwnerLink,
) -> OwnerProviderConnectionRead:
    provider = await session.get(VTSProvider, link.provider_id)
    if provider is None:
        raise RuntimeError("Provider connection scope is missing")

    selected_ids = await selected_vehicle_ids(session, link.id)
    total_vehicles = int(
        await session.scalar(select(func.count(Vehicle.id)).where(Vehicle.owner_id == owner.id))
        or 0
    )
    created_vehicle_count = int(
        await session.scalar(
            select(func.count(Vehicle.id)).where(
                Vehicle.owner_id == owner.id,
                Vehicle.created_by_provider_id == provider.id,
            )
        )
        or 0
    )
    active_tracking_count = int(
        await session.scalar(
            select(func.count(VehicleDeviceAssignment.id))
            .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
            .where(
                Vehicle.owner_id == owner.id,
                VehicleDeviceAssignment.provider_id == provider.id,
                VehicleDeviceAssignment.status.in_(VISIBLE_TRACKING_STATUSES),
            )
        )
        or 0
    )
    managed_vehicle_count = (
        total_vehicles
        if link.vehicle_scope_mode == OwnerProviderVehicleScopeMode.ALL
        else len(selected_ids)
    )

    return OwnerProviderConnectionRead(
        id=link.id,
        provider_id=provider.id,
        provider_code=provider.code,
        provider_name=provider.name,
        provider_trade_name=provider.trade_name,
        provider_district=provider.district,
        provider_support_phone=provider.support_contact_phone or provider.phone,
        provider_support_email=provider.support_contact_email or provider.email,
        status=link.status,
        requested_by=link.requested_by,
        requested_at=link.requested_at,
        responded_at=link.responded_at,
        ended_at=link.ended_at,
        reason=link.reason,
        vehicle_scope_mode=link.vehicle_scope_mode,
        selected_vehicle_ids=selected_ids,
        managed_vehicle_count=managed_vehicle_count,
        created_vehicle_count=created_vehicle_count,
        active_tracking_count=active_tracking_count,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


async def build_workspace(
    session: AsyncSession,
    *,
    owner: VehicleOwner,
) -> OwnerProviderConnectionWorkspace:
    providers = list(
        await session.scalars(
            select(VTSProvider)
            .where(VTSProvider.status == ProviderStatus.APPROVED)
            .order_by(VTSProvider.name)
        )
    )
    links = list(
        await session.scalars(
            select(VTSProviderOwnerLink)
            .where(VTSProviderOwnerLink.owner_id == owner.id)
            .order_by(VTSProviderOwnerLink.updated_at.desc())
        )
    )
    link_by_provider = {link.provider_id: link for link in links}

    vehicles = list(
        await session.scalars(
            select(Vehicle)
            .where(Vehicle.owner_id == owner.id)
            .order_by(Vehicle.created_at.desc())
        )
    )
    assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment)
            .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
            .where(
                Vehicle.owner_id == owner.id,
                VehicleDeviceAssignment.status.in_(VISIBLE_TRACKING_STATUSES),
            )
            .order_by(
                VehicleDeviceAssignment.vehicle_id,
                VehicleDeviceAssignment.valid_from.desc(),
            )
        )
    )
    latest_assignment: dict[uuid.UUID, VehicleDeviceAssignment] = {}
    for assignment in assignments:
        latest_assignment.setdefault(assignment.vehicle_id, assignment)

    provider_names = {provider.id: provider.name for provider in providers}
    for assignment in assignments:
        if assignment.provider_id and assignment.provider_id not in provider_names:
            provider = await session.get(VTSProvider, assignment.provider_id)
            if provider:
                provider_names[provider.id] = provider.name

    connection_items = [
        await build_connection_read(session, owner=owner, link=link) for link in links
    ]
    stats = OwnerProviderConnectionStats(
        total_links=len(links),
        active=sum(link.status == OwnerProviderLinkStatus.ACTIVE for link in links),
        pending_owner_approval=sum(
            link.status == OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL for link in links
        ),
        pending_provider_approval=sum(
            link.status == OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL for link in links
        ),
        ended_or_rejected=sum(
            link.status in {OwnerProviderLinkStatus.ENDED, OwnerProviderLinkStatus.REJECTED}
            for link in links
        ),
        approved_providers=len(providers),
    )

    return OwnerProviderConnectionWorkspace(
        stats=stats,
        providers=[
            OwnerProviderDirectoryItem(
                id=provider.id,
                code=provider.code,
                name=provider.name,
                trade_name=provider.trade_name,
                district=provider.district,
                website_url=provider.website_url,
                support_phone=provider.support_contact_phone or provider.phone,
                support_email=provider.support_contact_email or provider.email,
                service_coverage=provider.service_coverage or [],
                integration_status=provider.integration_status,
                status=provider.status,
                current_link_status=(
                    link_by_provider[provider.id].status
                    if provider.id in link_by_provider
                    else None
                ),
            )
            for provider in providers
        ],
        connections=connection_items,
        vehicles=[
            OwnerConnectionVehicleRead(
                id=vehicle.id,
                registration_number=vehicle.registration_number,
                registration_number_display=vehicle.registration_number_display,
                brand=vehicle.brand,
                model=vehicle.model,
                vehicle_type=vehicle.vehicle_type,
                verification_status=vehicle.verification_status,
                tracking_provider_id=(
                    latest_assignment[vehicle.id].provider_id
                    if vehicle.id in latest_assignment
                    else None
                ),
                tracking_provider_name=(
                    provider_names.get(latest_assignment[vehicle.id].provider_id)
                    if vehicle.id in latest_assignment
                    and latest_assignment[vehicle.id].provider_id
                    else None
                ),
                tracking_assignment_status=(
                    latest_assignment[vehicle.id].status
                    if vehicle.id in latest_assignment
                    else None
                ),
            )
            for vehicle in vehicles
        ],
    )


@router.get("", response_model=OwnerProviderConnectionWorkspace)
async def connection_workspace(
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionWorkspace:
    owner = await require_owner(session, actor)
    return await build_workspace(session, owner=owner)


@router.post(
    "/request",
    response_model=OwnerProviderConnectionRead,
    status_code=status.HTTP_201_CREATED,
)
async def request_provider_connection(
    payload: OwnerProviderConnectionRequest,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionRead:
    owner = await require_owner(session, actor)
    provider = await session.get(VTSProvider, payload.provider_id)
    if provider is None or provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=404, detail="Approved VTS provider not found")

    existing = await get_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
    )
    if existing and existing.status in {
        OwnerProviderLinkStatus.ACTIVE,
        OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL,
        OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL,
        OwnerProviderLinkStatus.SUSPENDED,
    }:
        raise HTTPException(
            status_code=409,
            detail="This provider connection is already active or awaiting a response",
        )

    link, _ = await create_or_reopen_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
        requested_by=OwnerProviderRequestSource.OWNER,
        requested_by_user_id=actor.id,
    )
    link.reason = payload.notes
    link.vehicle_scope_mode = OwnerProviderVehicleScopeMode.ALL
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.provider_connection_requested",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "provider_id": str(provider.id),
            "status": link.status.value,
            "vehicle_scope_mode": link.vehicle_scope_mode.value,
        },
    )
    await session.commit()
    await session.refresh(link)
    return await build_connection_read(session, owner=owner, link=link)


@router.post("/{link_id}/respond", response_model=OwnerProviderConnectionRead)
async def respond_to_provider_request(
    link_id: uuid.UUID,
    payload: OwnerProviderConnectionDecision,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionRead:
    owner = await require_owner(session, actor)
    link = await require_owner_link(session, owner=owner, link_id=link_id)
    if link.status != OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL:
        raise HTTPException(status_code=409, detail="This request is not awaiting owner approval")

    now = datetime.now(UTC)
    link.responded_by_user_id = actor.id
    link.responded_at = now
    link.reason = payload.notes
    link.status = (
        OwnerProviderLinkStatus.ACTIVE
        if payload.decision == OwnerProviderLinkDecision.APPROVE
        else OwnerProviderLinkStatus.REJECTED
    )
    if link.status == OwnerProviderLinkStatus.ACTIVE:
        link.vehicle_scope_mode = OwnerProviderVehicleScopeMode.ALL

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action=f"vehicle_owner.provider_connection_{payload.decision.value}",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "provider_id": str(link.provider_id),
            "status": link.status.value,
            "notes": payload.notes,
        },
    )
    await session.commit()
    await session.refresh(link)
    return await build_connection_read(session, owner=owner, link=link)


@router.post("/{link_id}/cancel", response_model=OwnerProviderConnectionRead)
async def cancel_provider_request(
    link_id: uuid.UUID,
    payload: OwnerProviderConnectionEnd,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionRead:
    owner = await require_owner(session, actor)
    link = await require_owner_link(session, owner=owner, link_id=link_id)
    if (
        link.status != OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL
        or link.requested_by != OwnerProviderRequestSource.OWNER
    ):
        raise HTTPException(status_code=409, detail="This owner request cannot be cancelled")

    link.status = OwnerProviderLinkStatus.ENDED
    link.ended_by_user_id = actor.id
    link.ended_at = datetime.now(UTC)
    link.reason = payload.reason
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.provider_connection_cancelled",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={"provider_id": str(link.provider_id), "reason": payload.reason},
    )
    await session.commit()
    await session.refresh(link)
    return await build_connection_read(session, owner=owner, link=link)


async def revoke_vehicle_accesses(
    session: AsyncSession,
    *,
    link: VTSProviderOwnerLink,
    actor_id: int,
    reason: str | None,
) -> int:
    now = datetime.now(UTC)
    accesses = list(
        await session.scalars(
            select(VTSProviderOwnerVehicleAccess).where(
                VTSProviderOwnerVehicleAccess.link_id == link.id,
                VTSProviderOwnerVehicleAccess.is_active.is_(True),
            )
        )
    )
    for access in accesses:
        access.is_active = False
        access.revoked_by_user_id = actor_id
        access.revoked_at = now
        access.reason = reason
    return len(accesses)


@router.post("/{link_id}/disconnect", response_model=OwnerProviderConnectionRead)
async def disconnect_provider(
    link_id: uuid.UUID,
    payload: OwnerProviderConnectionEnd,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionRead:
    owner = await require_owner(session, actor)
    link = await require_owner_link(session, owner=owner, link_id=link_id)
    if link.status not in {
        OwnerProviderLinkStatus.ACTIVE,
        OwnerProviderLinkStatus.SUSPENDED,
    }:
        raise HTTPException(status_code=409, detail="This provider connection is not active")

    now = datetime.now(UTC)
    link.status = OwnerProviderLinkStatus.ENDED
    link.ended_by_user_id = actor.id
    link.ended_at = now
    link.reason = payload.reason
    revoked_accesses = await revoke_vehicle_accesses(
        session,
        link=link,
        actor_id=actor.id,
        reason=payload.reason,
    )

    assignments = list(
        await session.scalars(
            select(VehicleDeviceAssignment)
            .join(Vehicle, Vehicle.id == VehicleDeviceAssignment.vehicle_id)
            .where(
                Vehicle.owner_id == owner.id,
                VehicleDeviceAssignment.provider_id == link.provider_id,
                VehicleDeviceAssignment.status.in_(VISIBLE_TRACKING_STATUSES),
            )
        )
    )
    for assignment in assignments:
        assignment.status = TrackingAssignmentStatus.ENDED
        assignment.valid_to = now
        assignment.is_primary = False
        assignment.rejection_reason = payload.reason

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.provider_connection_disconnected",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "provider_id": str(link.provider_id),
            "ended_assignments": len(assignments),
            "revoked_vehicle_accesses": revoked_accesses,
            "reason": payload.reason,
        },
    )
    await session.commit()
    await session.refresh(link)
    return await build_connection_read(session, owner=owner, link=link)


@router.put("/{link_id}/vehicle-scope", response_model=OwnerProviderConnectionRead)
async def update_provider_vehicle_scope(
    link_id: uuid.UUID,
    payload: OwnerProviderVehicleScopeUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerProviderConnectionRead:
    owner = await require_owner(session, actor)
    link = await require_owner_link(session, owner=owner, link_id=link_id)
    if link.status != OwnerProviderLinkStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Only active provider access can be scoped")

    requested_ids = list(dict.fromkeys(payload.vehicle_ids))
    owned_ids = set(
        await session.scalars(select(Vehicle.id).where(Vehicle.owner_id == owner.id))
    )
    invalid_ids = [vehicle_id for vehicle_id in requested_ids if vehicle_id not in owned_ids]
    if invalid_ids:
        raise HTTPException(status_code=422, detail="One or more vehicles do not belong to this owner")

    await revoke_vehicle_accesses(
        session,
        link=link,
        actor_id=actor.id,
        reason=payload.reason or "Vehicle access scope updated",
    )
    link.vehicle_scope_mode = payload.scope_mode

    if payload.scope_mode == OwnerProviderVehicleScopeMode.SELECTED:
        for vehicle_id in requested_ids:
            session.add(
                VTSProviderOwnerVehicleAccess(
                    link_id=link.id,
                    vehicle_id=vehicle_id,
                    granted_by_user_id=actor.id,
                    reason=payload.reason,
                )
            )

        excluded_ids = owned_ids.difference(requested_ids)
        if excluded_ids:
            now = datetime.now(UTC)
            assignments = list(
                await session.scalars(
                    select(VehicleDeviceAssignment).where(
                        VehicleDeviceAssignment.vehicle_id.in_(excluded_ids),
                        VehicleDeviceAssignment.provider_id == link.provider_id,
                        VehicleDeviceAssignment.status.in_(VISIBLE_TRACKING_STATUSES),
                    )
                )
            )
            for assignment in assignments:
                assignment.status = TrackingAssignmentStatus.ENDED
                assignment.valid_to = now
                assignment.is_primary = False
                assignment.rejection_reason = (
                    payload.reason or "Owner removed this vehicle from provider access"
                )

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.provider_vehicle_scope_updated",
        resource_type="vts_provider_owner_link",
        resource_public_id=link.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "provider_id": str(link.provider_id),
            "vehicle_scope_mode": payload.scope_mode.value,
            "vehicle_ids": [str(vehicle_id) for vehicle_id in requested_ids],
            "reason": payload.reason,
        },
    )
    await session.commit()
    await session.refresh(link)
    return await build_connection_read(session, owner=owner, link=link)
