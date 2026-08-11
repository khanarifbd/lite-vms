from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DocumentStatus,
    ProviderStatus,
    TelemetrySourceStatus,
    TrackingAssignmentStatus,
    UserRole,
    ViolationStatus,
    ViolationType,
)
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.dashboard.monitoring_schema import (
    MonitoringAlert,
    MonitoringStats,
    MonitoringVehicle,
    NationalMonitoringDashboard,
    ProviderHealthItem,
)
from app.modules.documents.model import VehicleDocument
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import TelemetrySource, TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate

router = APIRouter(prefix="/admin/monitoring", tags=["Admin National Monitoring"])

MONITORING_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
)
ONLINE_WINDOW = timedelta(minutes=5)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def packet_state(*, speed_kph: float | None, ignition: bool | None) -> str:
    if (speed_kph or 0) > 3:
        return "moving"
    if ignition is True:
        return "idle"
    return "stopped"


def duration_seconds(*, now: datetime, changed_at: datetime | None) -> int:
    normalized = as_utc(changed_at)
    if normalized is None:
        return 0
    return max(0, int((now - normalized).total_seconds()))


@router.get("", response_model=NationalMonitoringDashboard)
async def national_monitoring_dashboard(
    _: Annotated[User, Depends(require_roles(*MONITORING_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NationalMonitoringDashboard:
    now = datetime.now(UTC)
    online_cutoff = now - ONLINE_WINDOW

    active_assignments = (
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .subquery()
    )

    vehicle_rows = (
        await session.execute(
            select(
                Vehicle.id,
                Vehicle.registration_number,
                Vehicle.registration_number_display,
                Vehicle.latest_latitude,
                Vehicle.latest_longitude,
                Vehicle.latest_speed_kph,
                Vehicle.latest_heading,
                Vehicle.latest_ignition,
                Vehicle.movement_state,
                Vehicle.movement_state_changed_at,
                Vehicle.last_recorded_at,
                Vehicle.last_received_at,
                VehicleOwner.name.label("owner_name"),
                VTSProvider.name.label("provider_name"),
                TrackingDevice.last_seen_at.label("device_last_seen_at"),
            )
            .join(active_assignments, active_assignments.c.vehicle_id == Vehicle.id)
            .join(TrackingDevice, TrackingDevice.id == active_assignments.c.device_id)
            .join(VehicleOwner, VehicleOwner.id == Vehicle.owner_id)
            .outerjoin(VTSProvider, VTSProvider.id == active_assignments.c.provider_id)
            .order_by(Vehicle.last_received_at.desc().nullslast())
            .limit(500)
        )
    ).all()

    vehicles: list[MonitoringVehicle] = []
    state_counts = {"moving": 0, "idle": 0, "stopped": 0, "offline": 0, "no_data": 0}
    online_count = 0

    for row in vehicle_rows:
        last_seen = as_utc(row.device_last_seen_at or row.last_received_at)
        online = bool(last_seen and last_seen >= online_cutoff)
        has_location = (
            row.latest_latitude is not None
            and row.latest_longitude is not None
            and row.last_received_at is not None
        )

        if not has_location:
            movement_state = "no_data"
            state_changed_at = None
        elif not online:
            movement_state = "offline"
            state_changed_at = last_seen + ONLINE_WINDOW if last_seen else row.last_received_at
        else:
            movement_state = row.movement_state or packet_state(
                speed_kph=row.latest_speed_kph,
                ignition=row.latest_ignition,
            )
            state_changed_at = row.movement_state_changed_at or row.last_received_at

        state_counts[movement_state] += 1
        if online:
            online_count += 1

        vehicles.append(
            MonitoringVehicle(
                id=row.id,
                registration_number=row.registration_number,
                registration_number_display=row.registration_number_display,
                owner_name=row.owner_name,
                provider_name=row.provider_name,
                latitude=row.latest_latitude,
                longitude=row.latest_longitude,
                speed_kph=row.latest_speed_kph,
                heading=row.latest_heading,
                ignition=row.latest_ignition,
                recorded_at=row.last_recorded_at,
                received_at=row.last_received_at,
                online=online,
                movement_state=movement_state,
                movement_state_changed_at=state_changed_at,
                state_duration_seconds=duration_seconds(now=now, changed_at=state_changed_at),
            )
        )

    provider_rows = (
        await session.execute(
            select(
                VTSProvider.id.label("provider_id"),
                VTSProvider.code.label("provider_code"),
                VTSProvider.name.label("provider_name"),
                TelemetrySource.status.label("source_status"),
                func.count(func.distinct(active_assignments.c.vehicle_id)).label("tracked_vehicles"),
                func.max(TrackingDevice.last_seen_at).label("last_seen_at"),
                func.sum(
                    case((TrackingDevice.last_seen_at >= online_cutoff, 1), else_=0)
                ).label("online_vehicles"),
            )
            .join(TelemetrySource, TelemetrySource.provider_id == VTSProvider.id, isouter=True)
            .join(active_assignments, active_assignments.c.provider_id == VTSProvider.id, isouter=True)
            .join(TrackingDevice, TrackingDevice.id == active_assignments.c.device_id, isouter=True)
            .where(VTSProvider.status == ProviderStatus.APPROVED)
            .group_by(
                VTSProvider.id,
                VTSProvider.code,
                VTSProvider.name,
                TelemetrySource.status,
            )
            .order_by(VTSProvider.name)
        )
    ).all()

    provider_health: list[ProviderHealthItem] = []
    unhealthy_providers = 0
    for row in provider_rows:
        tracked = int(row.tracked_vehicles or 0)
        online = int(row.online_vehicles or 0)
        offline = max(0, tracked - online)
        source_status = row.source_status.value if row.source_status else None
        healthy = source_status == TelemetrySourceStatus.ACTIVE.value and (
            tracked == 0 or offline < tracked
        )
        if not healthy:
            unhealthy_providers += 1
        provider_health.append(
            ProviderHealthItem(
                provider_id=row.provider_id,
                provider_code=row.provider_code,
                provider_name=row.provider_name,
                source_status=source_status,
                tracked_vehicles=tracked,
                online_vehicles=online,
                offline_vehicles=offline,
                last_seen_at=row.last_seen_at,
                health="healthy" if healthy else "attention",
            )
        )

    alert_rows = (
        await session.execute(
            select(
                ViolationCandidate.id,
                ViolationCandidate.vehicle_id,
                Vehicle.registration_number,
                ViolationCandidate.violation_type,
                ViolationCandidate.status,
                ViolationCandidate.detected_value,
                ViolationCandidate.allowed_value,
                ViolationCandidate.latitude,
                ViolationCandidate.longitude,
                ViolationCandidate.detected_at,
            )
            .join(Vehicle, Vehicle.id == ViolationCandidate.vehicle_id)
            .where(ViolationCandidate.status == ViolationStatus.PENDING_REVIEW)
            .order_by(ViolationCandidate.detected_at.desc())
            .limit(100)
        )
    ).all()
    alerts = [
        MonitoringAlert(
            id=row.id,
            vehicle_id=row.vehicle_id,
            registration_number=row.registration_number,
            violation_type=row.violation_type.value,
            status=row.status.value,
            detected_value=row.detected_value,
            allowed_value=row.allowed_value,
            latitude=row.latitude,
            longitude=row.longitude,
            detected_at=row.detected_at,
        )
        for row in alert_rows
    ]

    expired_documents = int(
        await session.scalar(
            select(func.count())
            .select_from(VehicleDocument)
            .where(
                VehicleDocument.is_active.is_(True),
                (
                    (VehicleDocument.status == DocumentStatus.EXPIRED)
                    | (VehicleDocument.expires_at < date.today())
                ),
            )
        )
        or 0
    )

    def violation_count(violation_type: ViolationType) -> int:
        return sum(1 for alert in alerts if alert.violation_type == violation_type.value)

    tracked = len(vehicles)
    stats = MonitoringStats(
        tracked_vehicles=tracked,
        online_vehicles=online_count,
        offline_vehicles=state_counts["offline"],
        moving_vehicles=state_counts["moving"],
        idle_vehicles=state_counts["idle"],
        stopped_vehicles=state_counts["stopped"],
        no_data_vehicles=state_counts["no_data"],
        active_providers=len(provider_health),
        unhealthy_providers=unhealthy_providers,
        expired_documents=expired_documents,
        pending_violations=len(alerts),
        overspeed_alerts=violation_count(ViolationType.OVERSPEED),
        geofence_alerts=violation_count(ViolationType.GEOFENCE_VIOLATION),
        route_alerts=violation_count(ViolationType.ROUTE_VIOLATION),
    )
    return NationalMonitoringDashboard(
        generated_at=now,
        stats=stats,
        vehicles=vehicles,
        provider_health=provider_health,
        alerts=alerts,
    )
