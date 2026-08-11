import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    TelemetrySourceStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
    TrackingReviewDecision,
)


class ProviderConnectionRequest(BaseModel):
    provider_id: uuid.UUID
    device_identifier: str = Field(min_length=3, max_length=160)
    imei: str | None = Field(default=None, min_length=10, max_length=32)
    account_reference: str | None = Field(default=None, max_length=160)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)


class OwnerManagedDeviceRegister(BaseModel):
    device_identifier: str = Field(min_length=3, max_length=160)
    imei: str | None = Field(default=None, min_length=10, max_length=32)
    manufacturer: str = Field(min_length=2, max_length=120)
    model: str = Field(min_length=2, max_length=120)
    protocol: str = Field(min_length=2, max_length=100)
    firmware_version: str | None = Field(default=None, max_length=100)
    sim_number: str | None = Field(default=None, max_length=30)
    data_frequency_seconds: int = Field(default=10, ge=5, le=3600)


class DeviceTestTelemetry(BaseModel):
    recorded_at: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kph: float = Field(default=0, ge=0, le=400)
    heading: float | None = Field(default=None, ge=0, lt=360)
    ignition: bool | None = None
    raw_payload: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_timestamp(self) -> "DeviceTestTelemetry":
        if self.recorded_at.tzinfo is None:
            raise ValueError("recorded_at must include a timezone offset")
        return self


class TrackingDecision(BaseModel):
    decision: TrackingReviewDecision
    notes: str = Field(min_length=3, max_length=1000)


class TelemetrySourceRead(BaseModel):
    id: uuid.UUID
    code: str
    source_type: TelemetrySourceType
    tenant_public_id: uuid.UUID
    provider_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    status: TelemetrySourceStatus
    approved_at: datetime | None
    status_reason: str | None


class TrackingDeviceRead(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    device_identifier: str
    imei: str | None
    manufacturer: str | None
    model: str | None
    protocol: str | None
    firmware_version: str | None
    sim_number: str | None
    data_frequency_seconds: int | None
    ownership_type: DeviceOwnershipType
    owner_id: uuid.UUID | None
    provider_id: uuid.UUID | None
    certification_status: DeviceCertificationStatus
    operational_status: DeviceOperationalStatus
    last_tested_at: datetime | None
    last_seen_at: datetime | None


class VehicleDeviceAssignmentRead(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    owner_id: uuid.UUID
    provider_id: uuid.UUID | None
    source: TelemetrySourceRead
    device: TrackingDeviceRead
    account_reference: str | None
    valid_from: datetime
    valid_to: datetime | None
    status: TrackingAssignmentStatus
    is_primary: bool
    provider_confirmed_at: datetime | None
    approved_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


class TrackingAssignmentPage(BaseModel):
    items: list[VehicleDeviceAssignmentRead]
    total: int
    offset: int
    limit: int
