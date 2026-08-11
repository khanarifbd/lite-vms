import base64
import binascii
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, case, desc, exists, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import TrackingAssignmentStatus, UserRole
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.drivers.model import Driver
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/monitoring", tags=["Admin Monitoring Vehicles"])

MONITORING_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
)
ONLINE_WINDOW = timedelta(minutes=5)
FleetState = Literal["all", "online", "offline", "moving", "idle", "stopped", "no_data"]


class MonitoringFleetCounts(BaseModel):
    all: int
    online: int
    offline: int
    moving: int
    idle: int
    stopped: int
    no_data: int


class MonitoringVehicleItem(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    latitude: float | None
    longitude: float | None
    speed_kph: float | None
    last_known_speed_kph: float | None
    heading: float | None
    ignition: bool | None
    recorded_at: datetime | None
    received_at: datetime | None
    online: bool
    movement_state: str
    movement_state_changed_at: datetime | None
    state_duration_seconds: int


class MonitoringVehicleCursorPage(BaseModel):
    generated_at: datetime
    items: list[MonitoringVehicleItem]
    counts: MonitoringFleetCounts | None
    next_cursor: str | None
    has_next: bool
    limit: int


class MonitoringVehicleDetail(BaseModel):
    vehicle_id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    owner_code: str | None
    owner_phone: str | None
    provider_id: uuid.UUID | None
    provider_name: str | None
    provider_code: str | None
    provider_phone: str | None
    driver_id: uuid.UUID | None
    driver_name: str | None
    driver_code: str | None
    driver_phone: str | None
    driver_on_duty: bool | None
    tax_token_expiry_date: date | None
    fitness_expiry_date: date | None
    route_permit_expiry_date: date | None


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def duration_seconds(*, now: datetime, changed_at: datetime | None) -> int:
    normalized = as_utc(changed_at)
    if normalized is None:
        return 0
    return max(0, int((now - normalized).total_seconds()))


def normalized_search(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized or None


def encode_cursor(*, state: FleetState, search: str | None, seen_at: datetime, item_id: uuid.UUID) -> str:
    payload = json.dumps(
        {
            "state": state,
            "search": search,
            "seen_at": seen_at.isoformat(),
            "id": str(item_id),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_cursor(cursor: str, *, state: FleetState, search: str | None) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        payload = json.loads(
            base64.urlsafe_b64decode((cursor + padding).encode("ascii")).decode("utf-8")
        )
        if payload.get("state") != state or payload.get("search") != search:
            raise ValueError("Cursor query mismatch")
        seen_at = datetime.fromisoformat(payload["seen_at"])
        item_id = uuid.UUID(payload["id"])
    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        binascii.Error,
    ) as error:
        raise HTTPException(status_code=400, detail="Invalid monitoring cursor") from error
    return seen_at, item_id


def tracked_vehicle_condition():
    return exists(
        select(VehicleDeviceAssignment.id).where(
            VehicleDeviceAssignment.vehicle_id == Vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
    )


def state_expression(*, last_seen, online_cutoff: datetime):
    has_location = and_(
        Vehicle.latest_latitude.is_not(None),
        Vehicle.latest_longitude.is_not(None),
        Vehicle.last_received_at.is_not(None),
    )
    online = last_seen >= online_cutoff
    movement = case(
        (Vehicle.movement_state == "moving", literal("moving")),
        (Vehicle.movement_state == "idle", literal("idle")),
        (Vehicle.movement_state == "stopped", literal("stopped")),
        (Vehicle.latest_speed_kph > 3, literal("moving")),
        (Vehicle.latest_ignition.is_(True), literal("idle")),
        else_=literal("stopped"),
    )
    return case(
        (~has_location, literal("no_data")),
        (~online, literal("offline")),
        else_=movement,
    )


@router.get("/vehicles", response_model=MonitoringVehicleCursorPage)
async def monitoring_vehicle_feed(
    _: Annotated[User, Depends(require_roles(*MONITORING_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    state: Annotated[FleetState, Query()] = "all",
    search: Annotated[str | None, Query(max_length=120)] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=20, le=250)] = 100,
    include_counts: Annotated[bool, Query()] = True,
) -> MonitoringVehicleCursorPage:
    now = datetime.now(UTC)
    online_cutoff = now - ONLINE_WINDOW
    search_value = normalized_search(search)
    tracked_vehicle = tracked_vehicle_condition()

    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    last_seen = func.coalesce(Vehicle.last_received_at, literal(epoch))
    fleet_state = state_expression(last_seen=last_seen, online_cutoff=online_cutoff)

    query = select(
        Vehicle.id,
        Vehicle.registration_number,
        Vehicle.registration_number_display,
        Vehicle.latest_latitude,
        Vehicle.latest_longitude,
        Vehicle.latest_speed_kph,
        Vehicle.latest_heading,
        Vehicle.latest_ignition,
        Vehicle.movement_state_changed_at,
        Vehicle.last_recorded_at,
        Vehicle.last_received_at,
        last_seen.label("sort_seen_at"),
        fleet_state.label("fleet_state"),
    ).where(tracked_vehicle)

    if search_value:
        pattern = f"%{search_value}%"
        query = query.where(
            or_(
                func.lower(Vehicle.registration_number).like(pattern),
                func.lower(Vehicle.registration_number_display).like(pattern),
                func.lower(Vehicle.chassis_number).like(pattern),
                func.lower(Vehicle.engine_number).like(pattern),
            )
        )
    if state == "online":
        query = query.where(last_seen >= online_cutoff)
    elif state != "all":
        query = query.where(fleet_state == state)

    if cursor:
        cursor_seen_at, cursor_id = decode_cursor(
            cursor,
            state=state,
            search=search_value,
        )
        query = query.where(
            or_(
                last_seen < cursor_seen_at,
                and_(last_seen == cursor_seen_at, Vehicle.id < cursor_id),
            )
        )

    rows = (
        await session.execute(
            query.order_by(desc(last_seen), desc(Vehicle.id)).limit(limit + 1)
        )
    ).all()
    has_next = len(rows) > limit
    page_rows = rows[:limit]

    items: list[MonitoringVehicleItem] = []
    for row in page_rows:
        last_signal = as_utc(row.last_received_at)
        online = bool(last_signal and last_signal >= online_cutoff)
        movement_state = str(row.fleet_state)
        if movement_state == "no_data":
            changed_at = None
        elif movement_state == "offline":
            changed_at = last_signal + ONLINE_WINDOW if last_signal else row.last_received_at
        else:
            changed_at = row.movement_state_changed_at or row.last_received_at

        current_speed = 0.0 if movement_state in {"offline", "no_data"} else row.latest_speed_kph
        items.append(
            MonitoringVehicleItem(
                id=row.id,
                registration_number=row.registration_number,
                registration_number_display=row.registration_number_display,
                latitude=row.latest_latitude,
                longitude=row.latest_longitude,
                speed_kph=current_speed,
                last_known_speed_kph=row.latest_speed_kph,
                heading=row.latest_heading,
                ignition=row.latest_ignition,
                recorded_at=row.last_recorded_at,
                received_at=row.last_received_at,
                online=online,
                movement_state=movement_state,
                movement_state_changed_at=changed_at,
                state_duration_seconds=duration_seconds(now=now, changed_at=changed_at),
            )
        )

    next_cursor = None
    if has_next and page_rows:
        last_row = page_rows[-1]
        next_cursor = encode_cursor(
            state=state,
            search=search_value,
            seen_at=as_utc(last_row.sort_seen_at) or epoch,
            item_id=last_row.id,
        )

    counts = None
    if include_counts:
        count_query = (
            select(
                func.count().label("all_count"),
                func.sum(case((last_seen >= online_cutoff, 1), else_=0)).label("online_count"),
                func.sum(case((fleet_state == "offline", 1), else_=0)).label("offline_count"),
                func.sum(case((fleet_state == "moving", 1), else_=0)).label("moving_count"),
                func.sum(case((fleet_state == "idle", 1), else_=0)).label("idle_count"),
                func.sum(case((fleet_state == "stopped", 1), else_=0)).label("stopped_count"),
                func.sum(case((fleet_state == "no_data", 1), else_=0)).label("no_data_count"),
            )
            .select_from(Vehicle)
            .where(tracked_vehicle)
        )
        if search_value:
            pattern = f"%{search_value}%"
            count_query = count_query.where(
                or_(
                    func.lower(Vehicle.registration_number).like(pattern),
                    func.lower(Vehicle.registration_number_display).like(pattern),
                    func.lower(Vehicle.chassis_number).like(pattern),
                    func.lower(Vehicle.engine_number).like(pattern),
                )
            )
        count_row = (await session.execute(count_query)).one()
        counts = MonitoringFleetCounts(
            all=int(count_row.all_count or 0),
            online=int(count_row.online_count or 0),
            offline=int(count_row.offline_count or 0),
            moving=int(count_row.moving_count or 0),
            idle=int(count_row.idle_count or 0),
            stopped=int(count_row.stopped_count or 0),
            no_data=int(count_row.no_data_count or 0),
        )

    return MonitoringVehicleCursorPage(
        generated_at=now,
        items=items,
        counts=counts,
        next_cursor=next_cursor,
        has_next=has_next,
        limit=limit,
    )


@router.get("/vehicles/{vehicle_id}/details", response_model=MonitoringVehicleDetail)
async def monitoring_vehicle_detail(
    vehicle_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*MONITORING_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MonitoringVehicleDetail:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")

    assignment_row = (
        await session.execute(
            select(VehicleDeviceAssignment, VTSProvider)
            .outerjoin(VTSProvider, VTSProvider.id == VehicleDeviceAssignment.provider_id)
            .where(
                VehicleDeviceAssignment.vehicle_id == vehicle.id,
                VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
                VehicleDeviceAssignment.valid_to.is_(None),
                VehicleDeviceAssignment.is_primary.is_(True),
            )
            .order_by(desc(VehicleDeviceAssignment.valid_from))
            .limit(1)
        )
    ).first()
    provider = assignment_row[1] if assignment_row else None

    driver_row = (
        await session.execute(
            select(DriverAssignment, Driver)
            .join(Driver, Driver.id == DriverAssignment.driver_id)
            .where(
                DriverAssignment.vehicle_id == vehicle.id,
                DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
                DriverAssignment.valid_to.is_(None),
            )
            .order_by(
                desc(DriverAssignment.is_on_duty),
                desc(DriverAssignment.valid_from),
                desc(DriverAssignment.id),
            )
            .limit(1)
        )
    ).first()
    driver_assignment = driver_row[0] if driver_row else None
    driver = driver_row[1] if driver_row else None

    return MonitoringVehicleDetail(
        vehicle_id=vehicle.id,
        owner_id=owner.id,
        owner_name=owner.name,
        owner_code=owner.owner_code,
        owner_phone=owner.phone,
        provider_id=provider.id if provider else None,
        provider_name=provider.name if provider else None,
        provider_code=provider.code if provider else None,
        provider_phone=provider.phone if provider else None,
        driver_id=driver.id if driver else None,
        driver_name=driver.full_name if driver else None,
        driver_code=driver.driver_code if driver else None,
        driver_phone=driver.phone if driver else None,
        driver_on_duty=driver_assignment.is_on_duty if driver_assignment else None,
        tax_token_expiry_date=vehicle.tax_token_expiry_date,
        fitness_expiry_date=vehicle.fitness_expiry_date,
        route_permit_expiry_date=vehicle.route_permit_expiry_date,
    )
