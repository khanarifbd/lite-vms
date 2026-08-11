import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.common.enums import UserStatus
from app.modules.auth.schema import normalize_email, normalize_mobile
from app.modules.drivers.schema import DriverRead


class AdminDriverProfileUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    full_name: str | None = Field(default=None, min_length=2, max_length=180)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=10)
    mobile: str | None = Field(default=None, min_length=10, max_length=30)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    emergency_contact_name: str | None = Field(default=None, max_length=180)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    present_address: str | None = Field(default=None, min_length=5, max_length=1000)
    permanent_address: str | None = Field(default=None, max_length=1000)
    district: str | None = Field(default=None, min_length=2, max_length=100)
    photo_url: str | None = Field(default=None, max_length=1000)
    employment_type: str | None = Field(default=None, max_length=60)
    shift_information: str | None = Field(default=None, max_length=1000)
    medical_fitness_expiry_date: date | None = None
    change_note: str = Field(min_length=3, max_length=2000)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value is not None else None

    @field_validator("mobile", "emergency_contact_phone")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @model_validator(mode="after")
    def validate_profile_change(self) -> "AdminDriverProfileUpdate":
        changed_fields = self.model_fields_set - {"change_note"}
        if not changed_fields:
            raise ValueError("At least one driver profile field must be provided")
        required_fields = {"full_name", "mobile", "email", "present_address", "district"}
        cleared_required = [
            field_name
            for field_name in required_fields.intersection(changed_fields)
            if getattr(self, field_name) is None
        ]
        if cleared_required:
            raise ValueError(f"{', '.join(sorted(cleared_required))} cannot be cleared")
        return self


class AdminDriverAccountStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: Literal["activate", "lock", "suspend"]
    reason: str = Field(min_length=3, max_length=2000)


class AdminDriverHistoryEntry(BaseModel):
    id: uuid.UUID
    action: str
    actor_name: str | None
    reason: str | None
    previous_values: dict | None
    new_values: dict | None
    created_at: datetime


class AdminDriverDetail(BaseModel):
    driver: DriverRead
    pending_profile_changes: dict | None
    account_status: UserStatus
    last_administrative_reason: str | None
    history: list[AdminDriverHistoryEntry]


class AdminDriverActionResult(BaseModel):
    detail: AdminDriverDetail
    message: str
