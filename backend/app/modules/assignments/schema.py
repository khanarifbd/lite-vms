import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.drivers.enums import DriverAssignmentStatus


class AssignmentCreate(BaseModel):
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID
    valid_from: datetime | None = None
    start_on_duty: bool = False
    notes: str = Field(min_length=3, max_length=1000)


class AssignmentDutyStart(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class AssignmentEnd(BaseModel):
    notes: str = Field(min_length=3, max_length=1000)


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID
    owner_id: uuid.UUID
    provider_id: uuid.UUID | None
    assigned_by_user_id: int
    valid_from: datetime
    valid_to: datetime | None
    status: DriverAssignmentStatus
    is_on_duty: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class DriverDutySessionRead(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    vehicle_id: uuid.UUID
    vehicle_registration: str
    driver_id: uuid.UUID
    driver_code: str
    driver_name: str
    owner_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
    is_open: bool
    started_by_user_id: int
    ended_by_user_id: int | None
    start_reason: str
    end_reason: str | None
    source: str


class DriverDutyHistoryPage(BaseModel):
    items: list[DriverDutySessionRead]
    total: int
    offset: int
    limit: int
