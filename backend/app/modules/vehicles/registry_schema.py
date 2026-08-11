import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import (
    EntityStatus,
    TrackingAssignmentStatus,
    VehicleVerificationStatus,
)


class VehicleRegistryOwnerSummary(BaseModel):
    id: uuid.UUID
    owner_code: str | None = None
    owner_name: str


class VehicleRegistryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None = None
    vehicle_type: str
    vehicle_category: str | None = None
    brand: str | None = None
    model: str | None = None
    manufacturing_year: int | None = None
    color: str | None = None
    owner: VehicleRegistryOwnerSummary
    verification_status: VehicleVerificationStatus
    status: EntityStatus
    gps_online: bool = False
    tracking_last_seen_at: datetime | None = None
    latest_speed_kph: float | None = None
    tracking_assignment_status: TrackingAssignmentStatus | None = None
    tracking_provider_name: str | None = None
    current_driver_name: str | None = None
    document_status: str
    document_days_remaining: int | None = None
    missing_documents: list[str] = Field(default_factory=list)
    certificate_number: str | None = None
    certificate_issued_at: date | None = None
    certificate_expires_at: date | None = None
    created_at: datetime
    updated_at: datetime


class VehicleRegistryStats(BaseModel):
    total: int = 0
    verified: int = 0
    online: int = 0
    active_tracking: int = 0


class VehicleRegistryPage(BaseModel):
    items: list[VehicleRegistryItem] = Field(default_factory=list)
    total: int
    offset: int
    limit: int
    stats: VehicleRegistryStats
    next_cursor: str | None = None
