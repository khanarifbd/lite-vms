import re
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.common.enums import TrackingReviewDecision
from app.modules.tracking.schema import TrackingDeviceRead, VehicleDeviceAssignmentRead


class ProviderDeviceAssignmentCreate(BaseModel):
    existing_device_id: uuid.UUID | None = None
    device_identifier: str | None = Field(default=None, min_length=3, max_length=160)
    imei: str | None = Field(default=None, max_length=32)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    protocol: str | None = Field(default=None, max_length=100)
    firmware_version: str | None = Field(default=None, max_length=100)
    sim_number: str | None = Field(default=None, max_length=30)
    data_frequency_seconds: int | None = Field(default=10, ge=5, le=3600)
    account_reference: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def validate_device_choice(self) -> "ProviderDeviceAssignmentCreate":
        if self.existing_device_id is not None:
            if self.device_identifier or self.imei:
                raise ValueError("Existing and new device details cannot be submitted together")
            return self

        if not (self.device_identifier or "").strip() and (self.imei or "").strip():
            # Keep the provider workflow simple: IMEI is the device identifier
            # when no separate identifier is supplied.
            self.device_identifier = re.sub(r"[\s-]", "", self.imei or "")

        if not (self.device_identifier or "").strip():
            raise ValueError("Select an existing device or provide an IMEI/device identifier")
        return self


class ProviderDeviceIdentityAvailability(BaseModel):
    available: bool
    device_identifier_available: bool
    imei_available: bool


class ProviderDeviceConfirmation(BaseModel):
    decision: TrackingReviewDecision
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_rejection_notes(self) -> "ProviderDeviceConfirmation":
        if self.decision == TrackingReviewDecision.REJECT and not (self.notes or "").strip():
            raise ValueError("Rejection notes are required")
        return self


class ProviderDeviceTestPayload(BaseModel):
    recorded_at: datetime
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kph: float = Field(default=0, ge=0, le=400)
    heading: float | None = Field(default=None, ge=0, lt=360)
    ignition: bool | None = None
    raw_payload: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_recorded_at(self) -> "ProviderDeviceTestPayload":
        if self.recorded_at.tzinfo is None:
            raise ValueError("recorded_at must include a timezone offset")
        return self


class ProviderVehicleTrackingWorkspace(BaseModel):
    current_assignment: VehicleDeviceAssignmentRead | None
    assignments: list[VehicleDeviceAssignmentRead]
    available_devices: list[TrackingDeviceRead]
    active_count: int
    history_count: int
