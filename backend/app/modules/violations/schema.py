import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import ReviewDecision, ViolationStatus, ViolationType


class ViolationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None
    telemetry_id: uuid.UUID
    violation_type: ViolationType
    status: ViolationStatus
    detected_value: float | None
    allowed_value: float | None
    latitude: float
    longitude: float
    detected_at: datetime
    assigned_officer_id: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    review_note: str | None
    case_number: str | None
    created_at: datetime
    updated_at: datetime


class ViolationReview(BaseModel):
    decision: ReviewDecision
    officer_id: str = Field(min_length=2, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
