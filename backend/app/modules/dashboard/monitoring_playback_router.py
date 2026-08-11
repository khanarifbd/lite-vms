import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.telemetry.model import TelemetryPoint
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/admin/monitoring", tags=["Admin Monitoring Playback"])

MONITORING_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.POLICE_ADMIN,
    UserRole.POLICE_OFFICER,
)
MAX_PLAYBACK_WINDOW = timedelta(hours=24)


class MonitoringPlaybackPoint(BaseModel):
    id: uuid.UUID
    recorded_at: datetime
    latitude: float
    longitude: float
    speed_kph: float
    heading: float | None
    ignition: bool | None


class MonitoringPlaybackRead(BaseModel):
    vehicle_id: uuid.UUID
    registration_number: str
    start_at: datetime
    end_at: datetime
    total_points: int
    max_speed_kph: float
    distance_km: float
    points: list[MonitoringPlaybackPoint]


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def haversine_km(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> float:
    earth_radius_km = 6371.0088
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = math.radians(latitude_b - latitude_a)
    delta_lng = math.radians(longitude_b - longitude_a)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lng / 2) ** 2
    )
    return 2 * earth_radius_km * math.asin(min(1.0, math.sqrt(value)))


@router.get(
    "/vehicles/{vehicle_id}/playback",
    response_model=MonitoringPlaybackRead,
)
async def vehicle_monitoring_playback(
    vehicle_id: uuid.UUID,
    _: Annotated[User, Depends(require_roles(*MONITORING_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_at: Annotated[datetime, Query(description="Playback range start")],
    end_at: Annotated[datetime, Query(description="Playback range end")],
    limit: Annotated[int, Query(ge=2, le=5000)] = 3000,
) -> MonitoringPlaybackRead:
    normalized_start = as_utc(start_at)
    normalized_end = as_utc(end_at)
    if normalized_end <= normalized_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Playback end time must be after start time",
        )
    if normalized_end - normalized_start > MAX_PLAYBACK_WINDOW:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Playback range cannot exceed 24 hours",
        )

    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    points = list(
        await session.scalars(
            select(TelemetryPoint)
            .where(
                TelemetryPoint.vehicle_id == vehicle.id,
                TelemetryPoint.recorded_at >= normalized_start,
                TelemetryPoint.recorded_at <= normalized_end,
            )
            .order_by(TelemetryPoint.recorded_at.asc(), TelemetryPoint.id.asc())
            .limit(limit)
        )
    )

    distance_km = 0.0
    for previous, current in zip(points, points[1:]):
        distance_km += haversine_km(
            previous.latitude,
            previous.longitude,
            current.latitude,
            current.longitude,
        )

    registration_number = vehicle.registration_number_display or vehicle.registration_number
    return MonitoringPlaybackRead(
        vehicle_id=vehicle.id,
        registration_number=registration_number,
        start_at=normalized_start,
        end_at=normalized_end,
        total_points=len(points),
        max_speed_kph=max((float(point.speed_kph or 0) for point in points), default=0.0),
        distance_km=round(distance_km, 3),
        points=[
            MonitoringPlaybackPoint(
                id=point.id,
                recorded_at=point.recorded_at,
                latitude=point.latitude,
                longitude=point.longitude,
                speed_kph=float(point.speed_kph or 0),
                heading=point.heading,
                ignition=point.ignition,
            )
            for point in points
        ],
    )
