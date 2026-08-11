import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, UserRole, VehicleVerificationStatus
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.assignments.provider_vehicle_router import (
    ProviderDriverCandidate,
    ProviderVehicleDriverAssignment,
    ProviderVehicleDriverWorkspace,
)
from app.modules.assignments.router import assign_driver
from app.modules.assignments.schema import AssignmentCreate, AssignmentRead
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverAssignmentStatus,
    DriverLicenceStatus,
    DriverLinkStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverLicence, VehicleOwnerDriverLink
from app.modules.owners.service import get_owner_for_user
from app.modules.vehicles.model import Vehicle

router = APIRouter(
    prefix="/vehicles/owner-registration/{vehicle_id}/drivers",
    tags=["Owner Vehicle Drivers"],
)


class OwnerVehicleDriverAssign(BaseModel):
    driver_id: uuid.UUID
    start_on_duty: bool = True
    notes: str = Field(min_length=3, max_length=1000)


async def owner_vehicle_scope(
    session: AsyncSession,
    *,
    actor: User,
    vehicle_id: uuid.UUID,
) -> Vehicle:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner profile not found")
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None or vehicle.owner_id != owner.id:
        raise HTTPException(status_code=404, detail="Vehicle not found in this owner account")
    return vehicle


@router.get("", response_model=ProviderVehicleDriverWorkspace)
async def owner_vehicle_drivers(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderVehicleDriverWorkspace:
    vehicle = await owner_vehicle_scope(session, actor=actor, vehicle_id=vehicle_id)

    rows = (
        await session.execute(
            select(Driver, DriverLicence)
            .join(VehicleOwnerDriverLink, VehicleOwnerDriverLink.driver_id == Driver.id)
            .outerjoin(DriverLicence, DriverLicence.driver_id == Driver.id)
            .where(
                VehicleOwnerDriverLink.owner_id == vehicle.owner_id,
                VehicleOwnerDriverLink.status == DriverLinkStatus.ACTIVE,
            )
            .order_by(Driver.full_name.asc())
        )
    ).all()

    active_rows = (
        await session.execute(
            select(DriverAssignment, Driver)
            .join(Driver, Driver.id == DriverAssignment.driver_id)
            .where(
                DriverAssignment.vehicle_id == vehicle.id,
                DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            )
            .order_by(DriverAssignment.is_on_duty.desc(), Driver.full_name.asc())
        )
    ).all()
    assigned_driver_ids = {assignment.driver_id for assignment, _ in active_rows}

    candidates: list[ProviderDriverCandidate] = []
    for driver, licence in rows:
        reason: str | None = None
        if driver.status != EntityStatus.ACTIVE:
            reason = "Driver account is not active"
        elif driver.verification_status != DriverVerificationStatus.VERIFIED:
            reason = "Driver is not police verified"
        elif licence is None:
            reason = "Driving licence is missing"
        elif licence.verification_status != DriverLicenceStatus.VERIFIED:
            reason = "Driving licence is not verified"
        elif licence.expiry_date < date.today():
            reason = "Driving licence has expired"
        elif driver.id in assigned_driver_ids:
            reason = "Driver is already assigned to this vehicle"
        else:
            other_assignment = await session.scalar(
                select(DriverAssignment.id).where(
                    DriverAssignment.driver_id == driver.id,
                    DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
                    DriverAssignment.vehicle_id != vehicle.id,
                )
            )
            if other_assignment is not None:
                reason = "Driver already has another active vehicle assignment"

        candidates.append(
            ProviderDriverCandidate(
                id=driver.id,
                driver_code=driver.driver_code,
                full_name=driver.full_name,
                phone=driver.phone,
                email=driver.email,
                district=driver.district,
                photo_url=driver.photo_url,
                behaviour_score=driver.behaviour_score,
                verification_status=driver.verification_status.value,
                account_status=driver.status.value,
                licence_number=licence.licence_number if licence else None,
                licence_expiry=licence.expiry_date if licence else None,
                licence_status=licence.verification_status.value if licence else None,
                available_for_assignment=reason is None,
                unavailable_reason=reason,
            )
        )

    return ProviderVehicleDriverWorkspace(
        vehicle_id=vehicle.id,
        registration_number=vehicle.registration_number_display or vehicle.registration_number,
        owner_id=vehicle.owner_id,
        owner_name="Vehicle owner",
        can_assign=vehicle.verification_status == VehicleVerificationStatus.VERIFIED,
        candidates=candidates,
        active_assignments=[
            ProviderVehicleDriverAssignment(
                id=assignment.id,
                driver_id=driver.id,
                driver_code=driver.driver_code,
                full_name=driver.full_name,
                phone=driver.phone,
                status=assignment.status.value,
                is_on_duty=assignment.is_on_duty,
                valid_from=assignment.valid_from.isoformat(),
            )
            for assignment, driver in active_rows
        ],
    )


@router.post("/assign", response_model=AssignmentRead, status_code=201)
async def owner_assign_vehicle_driver(
    vehicle_id: uuid.UUID,
    payload: OwnerVehicleDriverAssign,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssignmentRead:
    vehicle = await owner_vehicle_scope(session, actor=actor, vehicle_id=vehicle_id)
    owner_link = await session.scalar(
        select(VehicleOwnerDriverLink).where(
            VehicleOwnerDriverLink.owner_id == vehicle.owner_id,
            VehicleOwnerDriverLink.driver_id == payload.driver_id,
            VehicleOwnerDriverLink.status == DriverLinkStatus.ACTIVE,
        )
    )
    if owner_link is None:
        raise HTTPException(status_code=403, detail="The driver must have an active link with this owner")

    return await assign_driver(
        payload=AssignmentCreate(
            vehicle_id=vehicle.id,
            driver_id=payload.driver_id,
            start_on_duty=payload.start_on_duty,
            notes=payload.notes,
        ),
        request=request,
        actor=actor,
        session=session,
    )
