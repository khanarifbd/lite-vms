import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.common.enums import (
    EntityStatus,
    TrackingAssignmentStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.drivers.model import Driver
from app.modules.owners.enums import (
    OwnerProviderLinkStatus,
    OwnerProviderVehicleScopeMode,
)
from app.modules.owners.model import (
    VehicleOwner,
    VTSProviderOwnerLink,
    VTSProviderOwnerVehicleAccess,
)
from app.modules.owners.service import get_owner_for_user
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)
from app.modules.vehicles.registry_schema import (
    VehicleRegistryItem,
    VehicleRegistryOwnerSummary,
    VehicleRegistryPage,
    VehicleRegistryStats,
)
from app.modules.vehicles.service import can_manage_all_vehicles

router = APIRouter(prefix="/vehicles", tags=["Vehicle Registration"])

REGISTRY_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
    UserRole.VEHICLE_OWNER,
)

TRACKING_VISIBLE_STATUSES = (
    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
    TrackingAssignmentStatus.TESTING,
    TrackingAssignmentStatus.ACTIVE,
)

def role_codes(actor: User) -> set[str]:
    return set(getattr(actor, "_role_codes", set()))


async def scope_conditions(
    session: AsyncSession,
    *,
    actor: User,
) -> list[object]:
    if can_manage_all_vehicles(actor):
        return []

    roles = role_codes(actor)
    if UserRole.VEHICLE_OWNER.value in roles:
        owner = await get_owner_for_user(session, actor.id)
        return [Vehicle.owner_id == owner.id] if owner else [Vehicle.id.is_(None)]

    provider_roles = {
        UserRole.VTS_ADMIN.value,
        UserRole.VTS_OPERATOR.value,
        UserRole.VTS_TECHNICAL.value,
        UserRole.VTS_VIEWER.value,
    }
    if roles.intersection(provider_roles):
        provider = await get_provider_for_user(session, actor.id)
        if provider is None:
            return [Vehicle.id.is_(None)]

        all_scope_owner_ids = select(VTSProviderOwnerLink.owner_id).where(
            VTSProviderOwnerLink.provider_id == provider.id,
            VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
            VTSProviderOwnerLink.vehicle_scope_mode
            == OwnerProviderVehicleScopeMode.ALL,
        )
        selected_vehicle_ids = (
            select(VTSProviderOwnerVehicleAccess.vehicle_id)
            .join(
                VTSProviderOwnerLink,
                VTSProviderOwnerLink.id == VTSProviderOwnerVehicleAccess.link_id,
            )
            .where(
                VTSProviderOwnerLink.provider_id == provider.id,
                VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
                VTSProviderOwnerLink.vehicle_scope_mode
                == OwnerProviderVehicleScopeMode.SELECTED,
                VTSProviderOwnerVehicleAccess.is_active.is_(True),
            )
        )
        created_vehicle = aliased(Vehicle)
        newly_created_vehicle_ids = (
            select(created_vehicle.id)
            .join(
                VTSProviderOwnerLink,
                VTSProviderOwnerLink.owner_id == created_vehicle.owner_id,
            )
            .where(
                VTSProviderOwnerLink.provider_id == provider.id,
                VTSProviderOwnerLink.status == OwnerProviderLinkStatus.ACTIVE,
                VTSProviderOwnerLink.vehicle_scope_mode
                == OwnerProviderVehicleScopeMode.SELECTED,
                created_vehicle.created_by_provider_id == provider.id,
                created_vehicle.created_at >= VTSProviderOwnerLink.updated_at,
            )
        )
        return [
            or_(
                Vehicle.owner_id.in_(all_scope_owner_ids),
                Vehicle.id.in_(selected_vehicle_ids),
                Vehicle.id.in_(newly_created_vehicle_ids),
            )
        ]

    return [Vehicle.id.is_(None)]


def latest_tracking_field(column):
    return (
        select(column)
        .where(
            VehicleDeviceAssignment.vehicle_id == Vehicle.id,
            VehicleDeviceAssignment.status.in_(TRACKING_VISIBLE_STATUSES),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .order_by(VehicleDeviceAssignment.valid_from.desc())
        .limit(1)
        .correlate(Vehicle)
        .scalar_subquery()
    )


def latest_driver_field(column):
    return (
        select(column)
        .where(
            DriverAssignment.vehicle_id == Vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            DriverAssignment.is_on_duty.is_(True),
        )
        .order_by(DriverAssignment.valid_from.desc())
        .limit(1)
        .correlate(Vehicle)
        .scalar_subquery()
    )


def registry_expressions():
    tracking_status = latest_tracking_field(VehicleDeviceAssignment.status)
    tracking_provider_id = latest_tracking_field(VehicleDeviceAssignment.provider_id)
    tracking_device_id = latest_tracking_field(VehicleDeviceAssignment.device_id)
    device_last_seen = (
        select(TrackingDevice.last_seen_at)
        .where(TrackingDevice.id == tracking_device_id)
        .scalar_subquery()
    )
    tracking_last_seen = func.coalesce(device_last_seen, Vehicle.last_recorded_at)
    provider_name = (
        select(VTSProvider.name)
        .where(VTSProvider.id == tracking_provider_id)
        .scalar_subquery()
    )
    driver_id = latest_driver_field(DriverAssignment.driver_id)
    driver_name = select(Driver.full_name).where(Driver.id == driver_id).scalar_subquery()
    owner_code = (
        select(VehicleOwner.owner_code)
        .where(VehicleOwner.id == Vehicle.owner_id)
        .scalar_subquery()
    )
    owner_name = (
        select(VehicleOwner.name)
        .where(VehicleOwner.id == Vehicle.owner_id)
        .scalar_subquery()
    )
    return {
        "tracking_status": tracking_status,
        "tracking_last_seen": tracking_last_seen,
        "provider_name": provider_name,
        "driver_name": driver_name,
        "owner_code": owner_code,
        "owner_name": owner_name,
    }


def apply_search(conditions: list[object], search: str | None) -> None:
    if not search or not search.strip():
        return

    raw = search.strip()
    raw_lower = raw.lower()
    identity_conditions: list[object] = []

    try:
        registration = normalize_bangladesh_registration(raw)
        identity_conditions.extend(
            [
                Vehicle.registration_number == registration,
                Vehicle.registration_number.like(f"{registration}%"),
            ]
        )
    except ValueError:
        pass

    try:
        serial = normalize_vehicle_serial(raw)
        identity_conditions.extend(
            [
                Vehicle.chassis_number == serial,
                Vehicle.chassis_number.like(f"{serial}%"),
                Vehicle.engine_number == serial,
                Vehicle.engine_number.like(f"{serial}%"),
            ]
        )
    except ValueError:
        pass

    conditions.append(
        or_(
            *identity_conditions,
            func.lower(Vehicle.registration_number_display).like(f"%{raw_lower}%"),
            func.lower(Vehicle.brand).like(f"%{raw_lower}%"),
            func.lower(Vehicle.model).like(f"%{raw_lower}%"),
        )
    )


@router.get("/registry", response_model=VehicleRegistryPage)
async def vehicle_registry(
    actor: Annotated[User, Depends(require_roles(*REGISTRY_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    owner_id: uuid.UUID | None = None,
    verification_status: Annotated[
        VehicleVerificationStatus | None,
        Query(alias="status"),
    ] = None,
    record_status: EntityStatus | None = None,
    vehicle_type: Annotated[str | None, Query(max_length=60)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    gps_online: bool | None = None,
    tracking_status: TrackingAssignmentStatus | None = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
) -> VehicleRegistryPage:
    expressions = registry_expressions()
    tracking_last_seen = expressions["tracking_last_seen"]
    assignment_status = expressions["tracking_status"]
    online_cutoff = datetime.now(UTC) - timedelta(minutes=5)

    conditions = await scope_conditions(session, actor=actor)
    if owner_id is not None:
        conditions.append(Vehicle.owner_id == owner_id)
    if verification_status is not None:
        conditions.append(Vehicle.verification_status == verification_status)
    if record_status is not None:
        conditions.append(Vehicle.status == record_status)
    if vehicle_type:
        conditions.append(func.lower(Vehicle.vehicle_type) == vehicle_type.strip().lower())
    if tracking_status is not None:
        conditions.append(assignment_status == tracking_status)
    if gps_online is True:
        conditions.append(tracking_last_seen >= online_cutoff)
    elif gps_online is False:
        conditions.append(
            or_(tracking_last_seen.is_(None), tracking_last_seen < online_cutoff)
        )
    apply_search(conditions, search)

    filtered_ids = select(Vehicle.id).where(*conditions)
    filtered_vehicle = Vehicle.id.in_(filtered_ids)
    gps_online_expression = tracking_last_seen >= online_cutoff

    stats_row = (
        await session.execute(
            select(
                func.count(Vehicle.id).label("total"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                Vehicle.verification_status
                                == VehicleVerificationStatus.VERIFIED,
                                1,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("verified"),
                func.coalesce(
                    func.sum(case((gps_online_expression, 1), else_=0)),
                    0,
                ).label("online"),
                func.coalesce(
                    func.sum(
                        case(
                            (assignment_status == TrackingAssignmentStatus.ACTIVE, 1),
                            else_=0,
                        )
                    ),
                    0,
                ).label("active_tracking"),
            ).where(filtered_vehicle)
        )
    ).one()

    rows = (
        await session.execute(
            select(
                Vehicle.id,
                Vehicle.registration_number,
                Vehicle.registration_number_display,
                Vehicle.vehicle_type,
                Vehicle.vehicle_category,
                Vehicle.brand,
                Vehicle.model,
                Vehicle.manufacturing_year,
                Vehicle.color,
                Vehicle.owner_id,
                expressions["owner_code"].label("owner_code"),
                expressions["owner_name"].label("owner_name"),
                Vehicle.verification_status,
                Vehicle.status,
                case((gps_online_expression, True), else_=False).label("gps_online"),
                tracking_last_seen.label("tracking_last_seen_at"),
                Vehicle.latest_speed_kph,
                assignment_status.label("tracking_assignment_status"),
                expressions["provider_name"].label("tracking_provider_name"),
                expressions["driver_name"].label("current_driver_name"),
                Vehicle.created_at,
                Vehicle.updated_at,
            )
            .where(filtered_vehicle)
            .order_by(Vehicle.registration_number, Vehicle.id)
            .offset(offset)
            .limit(limit)
        )
    ).all()

    items = [
        VehicleRegistryItem(
            id=row.id,
            registration_number=row.registration_number,
            registration_number_display=row.registration_number_display,
            vehicle_type=row.vehicle_type,
            vehicle_category=row.vehicle_category,
            brand=row.brand,
            model=row.model,
            manufacturing_year=row.manufacturing_year,
            color=row.color,
            owner=VehicleRegistryOwnerSummary(
                id=row.owner_id,
                owner_code=row.owner_code,
                owner_name=row.owner_name,
            ),
            verification_status=row.verification_status,
            status=row.status,
            gps_online=row.gps_online,
            tracking_last_seen_at=row.tracking_last_seen_at,
            latest_speed_kph=row.latest_speed_kph,
            tracking_assignment_status=row.tracking_assignment_status,
            tracking_provider_name=row.tracking_provider_name,
            current_driver_name=row.current_driver_name,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]

    stats = VehicleRegistryStats(
        total=int(stats_row.total or 0),
        verified=int(stats_row.verified or 0),
        online=int(stats_row.online or 0),
        active_tracking=int(stats_row.active_tracking or 0),
    )
    return VehicleRegistryPage(
        items=items,
        total=stats.total,
        offset=offset,
        limit=limit,
        stats=stats,
    )
