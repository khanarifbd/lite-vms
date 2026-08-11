import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import TrackingAssignmentStatus, UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/enforcement/vehicle-picker", tags=["Admin enforcement vehicle picker"])
PickerUser = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class VehiclePickerItem(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    vehicle_type: str
    vehicle_category: str | None
    brand: str | None
    model: str | None
    owner_name: str | None
    imei: str | None
    provider_name: str | None


class VehiclePickerPage(BaseModel):
    items: list[VehiclePickerItem]
    total: int
    page: int
    page_size: int
    total_pages: int


@router.get("", response_model=VehiclePickerPage)
async def search_vehicles(
    _: PickerUser,
    session: Session,
    search: Annotated[str | None, Query(max_length=120)] = None,
    ids: Annotated[list[uuid.UUID] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=10, le=50)] = 20,
) -> VehiclePickerPage:
    active_assignment = (
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .subquery()
    )

    base = (
        select(
            Vehicle.id,
            Vehicle.registration_number,
            Vehicle.registration_number_display,
            Vehicle.vehicle_type,
            Vehicle.vehicle_category,
            Vehicle.brand,
            Vehicle.model,
            VehicleOwner.name.label("owner_name"),
            TrackingDevice.imei,
            VTSProvider.name.label("provider_name"),
        )
        .join(VehicleOwner, VehicleOwner.id == Vehicle.owner_id)
        .outerjoin(active_assignment, active_assignment.c.vehicle_id == Vehicle.id)
        .outerjoin(TrackingDevice, TrackingDevice.id == active_assignment.c.device_id)
        .outerjoin(VTSProvider, VTSProvider.id == active_assignment.c.provider_id)
    )

    count_query = select(func.count(func.distinct(Vehicle.id))).select_from(Vehicle).join(
        VehicleOwner, VehicleOwner.id == Vehicle.owner_id
    ).outerjoin(active_assignment, active_assignment.c.vehicle_id == Vehicle.id).outerjoin(
        TrackingDevice, TrackingDevice.id == active_assignment.c.device_id
    ).outerjoin(VTSProvider, VTSProvider.id == active_assignment.c.provider_id)

    if ids:
        unique_ids = list(dict.fromkeys(ids))[:200]
        base = base.where(Vehicle.id.in_(unique_ids))
        count_query = count_query.where(Vehicle.id.in_(unique_ids))
    elif search and (term := search.strip()):
        lowered = term.lower()
        prefix = f"{lowered}%"
        contains = f"%{lowered}%"
        condition = or_(
            func.lower(Vehicle.registration_number).like(prefix),
            func.lower(Vehicle.registration_number_display).like(contains),
            func.lower(Vehicle.chassis_number).like(prefix),
            func.lower(Vehicle.engine_number).like(prefix),
            func.lower(TrackingDevice.imei).like(prefix),
            func.lower(TrackingDevice.device_identifier).like(prefix),
            func.lower(VehicleOwner.name).like(contains),
            func.lower(VTSProvider.name).like(contains),
            func.lower(Vehicle.brand).like(contains),
            func.lower(Vehicle.model).like(contains),
        )
        base = base.where(condition)
        count_query = count_query.where(condition)

    total = int(await session.scalar(count_query) or 0)
    offset = 0 if ids else (page - 1) * page_size
    effective_page_size = min(200, max(page_size, total)) if ids else page_size
    rows = (await session.execute(
        base.order_by(Vehicle.registration_number.asc(), Vehicle.id.asc()).offset(offset).limit(effective_page_size)
    )).all()

    return VehiclePickerPage(
        items=[VehiclePickerItem.model_validate(row._mapping) for row in rows],
        total=total,
        page=1 if ids else page,
        page_size=effective_page_size,
        total_pages=1 if ids else max(1, (total + page_size - 1) // page_size),
    )
