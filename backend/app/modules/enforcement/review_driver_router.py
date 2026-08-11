import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment, DriverDutySession
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.violations.model import ViolationCandidate

router = APIRouter(
    prefix="/admin/enforcement/national/review-queue",
    tags=["Super admin enforcement incident driver"],
)

SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class ReviewDriverContext(BaseModel):
    id: uuid.UUID
    driver_code: str
    full_name: str
    phone: str
    email: str | None
    district: str
    photo_url: str | None
    verification_status: str
    account_status: str
    behaviour_score: float
    licence_number: str | None
    licence_type: str | None
    licence_expiry_date: str | None
    licence_status: str | None
    assignment_id: uuid.UUID | None
    duty_session_id: uuid.UUID | None
    was_on_duty: bool
    resolution_source: str


def enum_value(value: object | None) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


@router.get("/{candidate_id}/driver", response_model=ReviewDriverContext | None)
async def review_candidate_driver(
    candidate_id: uuid.UUID,
    _: SuperAdmin,
    session: Session,
) -> ReviewDriverContext | None:
    candidate = await session.get(ViolationCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Violation candidate not found")

    driver_id = candidate.driver_id
    assignment_id: uuid.UUID | None = None
    duty_session_id: uuid.UUID | None = None
    was_on_duty = False
    resolution_source = "candidate"

    duty_session = await session.scalar(
        select(DriverDutySession)
        .where(
            DriverDutySession.vehicle_id == candidate.vehicle_id,
            DriverDutySession.started_at <= candidate.detected_at,
            or_(
                DriverDutySession.ended_at.is_(None),
                DriverDutySession.ended_at >= candidate.detected_at,
            ),
        )
        .order_by(DriverDutySession.started_at.desc())
        .limit(1)
    )
    if duty_session is not None:
        driver_id = duty_session.driver_id
        assignment_id = duty_session.assignment_id
        duty_session_id = duty_session.id
        was_on_duty = True
        resolution_source = "duty_session"

    if driver_id is None:
        assignment = await session.scalar(
            select(DriverAssignment)
            .where(
                DriverAssignment.vehicle_id == candidate.vehicle_id,
                DriverAssignment.valid_from <= candidate.detected_at,
                or_(
                    DriverAssignment.valid_to.is_(None),
                    DriverAssignment.valid_to >= candidate.detected_at,
                ),
            )
            .order_by(DriverAssignment.valid_from.desc())
            .limit(1)
        )
        if assignment is not None:
            driver_id = assignment.driver_id
            assignment_id = assignment.id
            was_on_duty = assignment.is_on_duty
            resolution_source = "assignment_history"

    if driver_id is None:
        return None

    driver = await session.get(Driver, driver_id)
    if driver is None:
        return None

    if assignment_id is None:
        assignment = await session.scalar(
            select(DriverAssignment)
            .where(
                DriverAssignment.vehicle_id == candidate.vehicle_id,
                DriverAssignment.driver_id == driver.id,
                DriverAssignment.valid_from <= candidate.detected_at,
                or_(
                    DriverAssignment.valid_to.is_(None),
                    DriverAssignment.valid_to >= candidate.detected_at,
                ),
            )
            .order_by(DriverAssignment.valid_from.desc())
            .limit(1)
        )
        if assignment is not None:
            assignment_id = assignment.id

    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )

    return ReviewDriverContext(
        id=driver.id,
        driver_code=driver.driver_code,
        full_name=driver.full_name,
        phone=driver.phone,
        email=driver.email,
        district=driver.district,
        photo_url=driver.photo_url,
        verification_status=enum_value(driver.verification_status) or "unknown",
        account_status=enum_value(driver.status) or "unknown",
        behaviour_score=driver.behaviour_score,
        licence_number=licence.licence_number if licence else None,
        licence_type=enum_value(licence.licence_type) if licence else None,
        licence_expiry_date=licence.expiry_date.isoformat() if licence else None,
        licence_status=enum_value(licence.verification_status) if licence else None,
        assignment_id=assignment_id,
        duty_session_id=duty_session_id,
        was_on_duty=was_on_duty,
        resolution_source=resolution_source,
    )
