import uuid
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.assignments.model import DriverAssignment, DriverDutySession


async def close_open_duty_sessions(
    session: AsyncSession,
    *,
    ended_at: datetime,
    ended_by_user_id: int,
    reason: str,
    vehicle_id: uuid.UUID | None = None,
    assignment_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
) -> list[DriverDutySession]:
    query = select(DriverDutySession).where(DriverDutySession.ended_at.is_(None))
    if vehicle_id is not None:
        query = query.where(DriverDutySession.vehicle_id == vehicle_id)
    if assignment_id is not None:
        query = query.where(DriverDutySession.assignment_id == assignment_id)
    if driver_id is not None:
        query = query.where(DriverDutySession.driver_id == driver_id)
    if vehicle_id is None and assignment_id is None and driver_id is None:
        raise ValueError("A duty-session scope is required")

    sessions = list(await session.scalars(query))
    for duty_session in sessions:
        duty_session.ended_at = max(ended_at, duty_session.started_at)
        duty_session.ended_by_user_id = ended_by_user_id
        duty_session.end_reason = reason
    return sessions


def open_duty_session(
    session: AsyncSession,
    *,
    assignment: DriverAssignment,
    started_at: datetime,
    started_by_user_id: int,
    reason: str,
    source: str,
) -> DriverDutySession:
    duty_session = DriverDutySession(
        assignment_id=assignment.id,
        vehicle_id=assignment.vehicle_id,
        driver_id=assignment.driver_id,
        owner_id=assignment.owner_id,
        started_at=started_at,
        started_by_user_id=started_by_user_id,
        start_reason=reason,
        source=source,
    )
    session.add(duty_session)
    return duty_session


async def get_vehicle_driver_on_duty_at(
    session: AsyncSession,
    *,
    vehicle_id: uuid.UUID,
    occurred_at: datetime,
) -> DriverDutySession | None:
    return await session.scalar(
        select(DriverDutySession)
        .where(
            DriverDutySession.vehicle_id == vehicle_id,
            DriverDutySession.started_at <= occurred_at,
            or_(
                DriverDutySession.ended_at.is_(None),
                DriverDutySession.ended_at > occurred_at,
            ),
        )
        .order_by(DriverDutySession.started_at.desc())
        .limit(1)
    )
