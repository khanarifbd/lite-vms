import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    EntityStatus,
    OrganizationStatus,
    OwnerType,
    OwnerVerificationStatus,
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
from app.modules.owners.admin_schema import (
    AdminOwnerDetail,
    AdminOwnerStatusResult,
    AdminOwnerStatusUpdate,
    AdminOwnerVehicleSummary,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.schema import OwnerPage
from app.modules.owners.service import build_owner_read, get_owner_by_id
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/owners", tags=["Admin Vehicle Owner Review"])

ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)
ACCOUNT_HISTORY_ACTIONS = (
    "vehicle_owner.account_activated",
    "vehicle_owner.account_locked",
    "vehicle_owner.account_suspended",
    "vehicle_owner.account_reactivate",
    "vehicle_owner.account_suspend",
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def build_admin_owner_detail(
    session: AsyncSession,
    owner: VehicleOwner,
) -> AdminOwnerDetail:
    admin = (
        await session.get(User, owner.primary_admin_user_id)
        if owner.primary_admin_user_id is not None
        else None
    )
    vehicles = list(
        await session.scalars(
            select(Vehicle)
            .where(Vehicle.owner_id == owner.id)
            .order_by(Vehicle.updated_at.desc())
        )
    )
    history = await build_audit_history(
        session,
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        actions=ACCOUNT_HISTORY_ACTIONS,
    )
    return AdminOwnerDetail(
        owner=await build_owner_read(session, owner),
        vehicles=[
            AdminOwnerVehicleSummary(
                id=str(vehicle.id),
                registration_number=vehicle.registration_number,
                registration_number_display=vehicle.registration_number_display,
                vehicle_type=vehicle.vehicle_type,
                brand=vehicle.brand,
                model=vehicle.model,
                verification_status=vehicle.verification_status.value,
                status=vehicle.status.value,
                latest_speed_kph=vehicle.latest_speed_kph,
                last_recorded_at=(
                    vehicle.last_recorded_at.isoformat() if vehicle.last_recorded_at else None
                ),
            )
            for vehicle in vehicles
        ],
        account_status=admin.status if admin is not None else None,
        last_administrative_reason=history[0].reason if history else None,
        history=history,
    )


@router.get("", response_model=OwnerPage)
async def list_admin_owners(
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    verification_status: Annotated[OwnerVerificationStatus | None, Query(alias="status")] = None,
    owner_type: OwnerType | None = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 25,
) -> OwnerPage:
    query = select(VehicleOwner)
    count_query = select(func.count(VehicleOwner.id))
    if verification_status is not None:
        query = query.where(VehicleOwner.verification_status == verification_status)
        count_query = count_query.where(VehicleOwner.verification_status == verification_status)
    if owner_type is not None:
        query = query.where(VehicleOwner.owner_type == owner_type)
        count_query = count_query.where(VehicleOwner.owner_type == owner_type)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(VehicleOwner.name).like(pattern),
            func.lower(VehicleOwner.application_number).like(pattern),
            func.lower(VehicleOwner.owner_code).like(pattern),
            func.lower(VehicleOwner.phone).like(pattern),
            func.lower(VehicleOwner.email).like(pattern),
            func.lower(VehicleOwner.nid_or_registration).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)

    owners = list(
        await session.scalars(
            query.order_by(VehicleOwner.updated_at.desc()).offset(offset).limit(limit)
        )
    )
    return OwnerPage(
        items=[await build_owner_read(session, owner) for owner in owners],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/{owner_id}", response_model=AdminOwnerDetail)
async def read_admin_owner(
    owner_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminOwnerDetail:
    owner = await get_owner_by_id(session, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    return await build_admin_owner_detail(session, owner)


@router.post("/{owner_id}/account-status", response_model=AdminOwnerStatusResult)
async def update_owner_account_status(
    owner_id: uuid.UUID,
    payload: AdminOwnerStatusUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AdminOwnerStatusResult:
    owner = await get_owner_by_id(session, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    if (
        owner.tenant_id is None
        or owner.root_organization_id is None
        or owner.primary_admin_user_id is None
    ):
        raise HTTPException(status_code=409, detail="Owner identity scope is incomplete")

    tenant = await session.get(Tenant, owner.tenant_id)
    organization = await session.get(Organization, owner.root_organization_id)
    owner_user = await session.get(User, owner.primary_admin_user_id)
    if tenant is None or organization is None or owner_user is None:
        raise HTTPException(status_code=409, detail="Owner identity scope is missing")
    security = await get_security(session, owner_user.id)
    if security is None:
        raise HTTPException(status_code=409, detail="Owner security record is missing")
    if owner_user.status not in {
        UserStatus.ACTIVE,
        UserStatus.LOCKED,
        UserStatus.SUSPENDED,
    }:
        raise HTTPException(
            status_code=409,
            detail=f"Owner account cannot be changed from {owner_user.status.value}",
        )

    action = "activate" if payload.action == "reactivate" else payload.action
    previous_values = {
        "account_status": owner_user.status.value,
        "verification_status": owner.verification_status.value,
        "owner_status": owner.status.value,
        "tenant_status": tenant.status.value,
        "organization_status": organization.status.value,
    }

    if action == "lock":
        if owner.verification_status != OwnerVerificationStatus.APPROVED:
            raise HTTPException(
                status_code=409,
                detail="Only approved vehicle owners can be locked",
            )
        if owner_user.status == UserStatus.LOCKED:
            raise HTTPException(status_code=409, detail="Vehicle owner account is already locked")
        if owner_user.status != UserStatus.ACTIVE:
            raise HTTPException(
                status_code=409,
                detail="Activate the vehicle owner account before locking it",
            )
        owner_user.status = UserStatus.LOCKED
        message = "Vehicle-owner account locked"
    elif action == "suspend":
        if owner.verification_status == OwnerVerificationStatus.SUSPENDED:
            raise HTTPException(status_code=409, detail="Vehicle owner is already suspended")
        if owner.verification_status != OwnerVerificationStatus.APPROVED:
            raise HTTPException(
                status_code=409,
                detail="Only approved vehicle owners can be suspended",
            )
        owner.verification_status = OwnerVerificationStatus.SUSPENDED
        owner.status = EntityStatus.SUSPENDED
        tenant.status = TenantStatus.SUSPENDED
        organization.status = OrganizationStatus.SUSPENDED
        owner_user.status = UserStatus.SUSPENDED
        message = "Vehicle-owner account suspended"
    else:
        owner_was_suspended = (
            owner.verification_status == OwnerVerificationStatus.SUSPENDED
        )
        account_was_restricted = owner_user.status in {
            UserStatus.LOCKED,
            UserStatus.SUSPENDED,
        }
        if not owner_was_suspended and not account_was_restricted:
            raise HTTPException(
                status_code=409,
                detail="Vehicle owner account is already active",
            )
        if owner.verification_status not in {
            OwnerVerificationStatus.APPROVED,
            OwnerVerificationStatus.SUSPENDED,
        }:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Vehicle owner cannot be activated from "
                    f"{owner.verification_status.value}"
                ),
            )
        owner.verification_status = OwnerVerificationStatus.APPROVED
        owner.status = EntityStatus.ACTIVE
        tenant.status = TenantStatus.ACTIVE
        organization.status = OrganizationStatus.ACTIVE
        owner_user.status = UserStatus.ACTIVE
        message = "Vehicle-owner account activated"

    owner_user.updated_by_id = actor.id
    security.failed_login_count = 0
    security.locked_until = None
    security.token_version += 1
    await revoke_all_sessions(session, owner_user.id)

    audit_action = {
        "activate": "vehicle_owner.account_activated",
        "lock": "vehicle_owner.account_locked",
        "suspend": "vehicle_owner.account_suspended",
    }[action]
    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=owner.root_organization_id,
        action=audit_action,
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values=previous_values,
        new_values={
            "account_status": owner_user.status.value,
            "verification_status": owner.verification_status.value,
            "owner_status": owner.status.value,
            "tenant_status": tenant.status.value,
            "organization_status": organization.status.value,
            "reason": payload.reason,
        },
        reason=payload.reason,
    )
    await session.commit()
    await session.refresh(owner)
    return AdminOwnerStatusResult(
        owner=await build_owner_read(session, owner),
        message=message,
    )
