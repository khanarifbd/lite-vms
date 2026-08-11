import uuid
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.telemetry.model import TelemetryPoint
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate

router = APIRouter(
    prefix="/admin/enforcement/national",
    tags=["Super admin violation incident history"],
)
SuperAdmin = Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))]
Session = Annotated[AsyncSession, Depends(get_session)]


class IncidentTripPoint(BaseModel):
    id: uuid.UUID
    recorded_at: str
    latitude: float
    longitude: float
    speed_kph: float
    heading: float | None
    ignition: bool | None
    is_incident_point: bool


class IncidentTripHistoryRead(BaseModel):
    candidate_id: uuid.UUID
    vehicle_id: uuid.UUID
    registration_number: str
    detected_at: str
    window_start: str
    window_end: str
    detected_speed_kph: float | None
    allowed_speed_kph: float | None
    points: list[IncidentTripPoint]


@router.get(
    "/review-queue/{candidate_id}/trip-history",
    response_model=IncidentTripHistoryRead,
)
async def incident_trip_history(
    candidate_id: uuid.UUID,
    _: SuperAdmin,
    session: Session,
) -> IncidentTripHistoryRead:
    candidate = await session.get(ViolationCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="Violation candidate not found")

    vehicle = await session.get(Vehicle, candidate.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Incident vehicle not found")

    window_start = candidate.detected_at - timedelta(minutes=2)
    window_end = candidate.detected_at + timedelta(minutes=2)

    query = (
        select(TelemetryPoint)
        .where(
            TelemetryPoint.vehicle_id == candidate.vehicle_id,
            TelemetryPoint.recorded_at >= window_start,
            TelemetryPoint.recorded_at <= window_end,
        )
        .order_by(TelemetryPoint.recorded_at.asc(), TelemetryPoint.id.asc())
        .limit(500)
    )
    telemetry_points = list(await session.scalars(query))

    incident_point_id = None
    if telemetry_points:
        incident_point_id = min(
            telemetry_points,
            key=lambda point: abs((point.recorded_at - candidate.detected_at).total_seconds()),
        ).id

    registration = vehicle.registration_number_display or vehicle.registration_number
    return IncidentTripHistoryRead(
        candidate_id=candidate.id,
        vehicle_id=vehicle.id,
        registration_number=registration,
        detected_at=candidate.detected_at.isoformat(),
        window_start=window_start.isoformat(),
        window_end=window_end.isoformat(),
        detected_speed_kph=candidate.detected_value,
        allowed_speed_kph=candidate.allowed_value,
        points=[
            IncidentTripPoint(
                id=point.id,
                recorded_at=point.recorded_at.isoformat(),
                latitude=point.latitude,
                longitude=point.longitude,
                speed_kph=point.speed_kph,
                heading=point.heading,
                ignition=point.ignition,
                is_incident_point=point.id == incident_point_id,
            )
            for point in telemetry_points
        ],
    )
