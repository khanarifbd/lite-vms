import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.modules.assignments.duty_service import close_open_duty_sessions
from app.modules.assignments.model import DriverAssignment
from app.modules.assignments.schema import AssignmentEnd, AssignmentRead
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.owners.service import has_active_provider_owner_link
from app.modules.providers.service import get_provider_for_user
from app.common.enums import UserRole

router = APIRouter(
    prefix="/vehicles/provider-registration/{vehicle_id}/drivers",
    tags=["Provider Vehicle Drivers"],
)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post("/{assignment_id}/end", response_model=AssignmentRead)
async def provider_end_driver_assignment(
    vehicle_id: uuid.UUID,
    assignment_id: uuid.UUID,
    payload: AssignmentEnd,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverAssignment:
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider profile not found")

    assignment = await session.get(DriverAssignment, assignment_id)
    if assignment is None or assignment.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Driver assignment not found for this vehicle")
    if assignment.status != DriverAssignmentStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Driver assignment is not active")

    if not await has_active_provider_owner_link(
        session,
        provider_id=provider.id,
        owner_id=assignment.owner_id,
    ):
        raise HTTPException(
            status_code=403,
            detail="The vehicle owner is not actively connected to this VTS provider",
        )

    was_on_duty = assignment.is_on_duty
    ended_at = datetime.now(UTC)
    if was_on_duty:
        await close_open_duty_sessions(
            session,
            assignment_id=assignment.id,
            ended_at=ended_at,
            ended_by_user_id=actor.id,
            reason=payload.notes,
        )

    assignment.status = DriverAssignmentStatus.ENDED
    assignment.is_on_duty = False
    assignment.valid_to = ended_at
    assignment.notes = payload.notes

    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="driver.vehicle_assignment_ended",
        resource_type="driver_assignment",
        resource_public_id=assignment.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={
            "status": DriverAssignmentStatus.ACTIVE.value,
            "is_on_duty": was_on_duty,
        },
        new_values={
            "status": assignment.status.value,
            "is_on_duty": False,
            "driver_id": str(assignment.driver_id),
            "vehicle_id": str(assignment.vehicle_id),
            "ended_by_provider_id": str(provider.id),
        },
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(assignment)
    return assignment
