import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import EntityStatus, UserRole, VehicleVerificationStatus
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.assignments.router import assign_driver
from app.modules.assignments.schema import AssignmentCreate, AssignmentRead
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverAssignmentStatus,
    DriverLicenceStatus,
    DriverLinkSource,
    DriverLinkStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import (
    Driver,
    DriverLicence,
    VTSProviderDriverLink,
    VehicleOwnerDriverLink,
)
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import has_active_provider_owner_link
from app.modules.providers.service import get_provider_for_user
from app.modules.vehicles.model import Vehicle

router = APIRouter(
    prefix="/vehicles/provider-registration/{vehicle_id}/drivers",
    tags=["Provider Vehicle Drivers"],
)


class ProviderDriverCandidate(BaseModel):
    id: uuid.UUID
    driver_code: str
    full_name: str
    phone: str
    email: str
    district: str
    photo_url: str | None
    behaviour_score: float
    verification_status: str
    account_status: str
    licence_number: str | None
    licence_expiry: date | None
    licence_status: str | None
    available_for_assignment: bool
    unavailable_reason: str | None


class ProviderVehicleDriverAssignment(BaseModel):
    id: uuid.UUID
    driver_id: uuid.UUID
    driver_code: str
    full_name: str
    phone: str
    status: str
    is_on_duty: bool
    valid_from: str


class ProviderVehicleDriverWorkspace(BaseModel):
    vehicle_id: uuid.UUID
    registration_number: str
    owner_id: uuid.UUID
    owner_name: str
    can_assign: bool
    candidates: list[ProviderDriverCandidate]
    active_assignments: list[ProviderVehicleDriverAssignment]


class ProviderVehicleDriverAssign(BaseModel):
    driver_id: uuid.UUID
    start_on_duty: bool = True
    notes: str = Field(min_length=3, max_length=1000)


async def provider_vehicle_scope(
    session: AsyncSession,
    *,
    actor: User,
    vehicle_id: uuid.UUID,
) -> tuple[Vehicle, uuid.UUID]:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider profile not found")
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=vehicle.owner_id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The vehicle owner is not actively connected to this VTS provider",
        )
    return vehicle, provider.id


@router.get("", response_model=ProviderVehicleDriverWorkspace)
async def provider_vehicle_drivers(
    vehicle_id: uuid.UUID,
    actor: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.VTS_ADMIN,
                UserRole.VTS_OPERATOR,
                UserRole.VTS_TECHNICAL,
                UserRole.VTS_VIEWER,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderVehicleDriverWorkspace:
    vehicle, _ = await provider_vehicle_scope(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    owner = await session.get(VehicleOwner, vehicle.owner_id)

    rows = (
        await session.execute(
            select(Driver, DriverLicence)
            .join(
                VehicleOwnerDriverLink,
                VehicleOwnerDriverLink.driver_id == Driver.id,
            )
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
        owner_name=owner.name if owner is not None else "Vehicle owner",
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
async def provider_assign_vehicle_driver(
    vehicle_id: uuid.UUID,
    payload: ProviderVehicleDriverAssign,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AssignmentRead:
    vehicle, provider_id = await provider_vehicle_scope(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    owner_link = await session.scalar(
        select(VehicleOwnerDriverLink).where(
            VehicleOwnerDriverLink.owner_id == vehicle.owner_id,
            VehicleOwnerDriverLink.driver_id == payload.driver_id,
            VehicleOwnerDriverLink.status == DriverLinkStatus.ACTIVE,
        )
    )
    if owner_link is None:
        raise HTTPException(
            status_code=403,
            detail="The driver must have an active link with the vehicle owner",
        )

    provider_link = await session.scalar(
        select(VTSProviderDriverLink).where(
            VTSProviderDriverLink.provider_id == provider_id,
            VTSProviderDriverLink.driver_id == payload.driver_id,
        )
    )
    now = datetime.now(UTC)
    if provider_link is None:
        provider_link = VTSProviderDriverLink(
            provider_id=provider_id,
            driver_id=payload.driver_id,
            status=DriverLinkStatus.ACTIVE,
            requested_by=DriverLinkSource.VTS_PROVIDER,
            requested_by_user_id=actor.id,
            requested_at=now,
            responded_by_user_id=actor.id,
            responded_at=now,
            reason="Inherited from active owner-driver and provider-owner connections",
        )
        session.add(provider_link)
        await session.flush()
    elif provider_link.status != DriverLinkStatus.ACTIVE:
        provider_link.status = DriverLinkStatus.ACTIVE
        provider_link.responded_by_user_id = actor.id
        provider_link.responded_at = now
        provider_link.ended_at = None
        provider_link.reason = "Reactivated from active owner-driver and provider-owner connections"
        await session.flush()

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
