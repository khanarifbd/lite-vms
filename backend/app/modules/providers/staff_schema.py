import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.enums import MembershipStatus, UserRole, UserStatus
from app.modules.auth.schema import normalize_email, normalize_mobile

PROVIDER_STAFF_ROLES = {
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
}


class ProviderStaffCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=180)
    mobile: str | None = Field(default=None, max_length=30)
    full_name: str = Field(min_length=2, max_length=180)
    temporary_password: str = Field(min_length=6, max_length=128)
    role_code: UserRole
    employee_id: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=140)
    is_technical_contact: bool = False

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("role_code")
    @classmethod
    def validate_role(cls, value: UserRole) -> UserRole:
        if value not in PROVIDER_STAFF_ROLES:
            raise ValueError("The selected role is not assignable to provider staff")
        return value


class ProviderStaffUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=2, max_length=180)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    mobile: str | None = Field(default=None, max_length=30)
    role_code: UserRole | None = None
    employee_id: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=140)
    is_technical_contact: bool | None = None
    status: UserStatus | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value is not None else None

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("role_code")
    @classmethod
    def validate_role(cls, value: UserRole | None) -> UserRole | None:
        if value is not None and value not in PROVIDER_STAFF_ROLES:
            raise ValueError("The selected role is not assignable to provider staff")
        return value

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: UserStatus | None) -> UserStatus | None:
        if value is not None and value not in {
            UserStatus.ACTIVE,
            UserStatus.SUSPENDED,
            UserStatus.DISABLED,
        }:
            raise ValueError("Provider staff status must be active, suspended, or disabled")
        return value


class ProviderStaffPasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(min_length=6, max_length=128)
    reason: str | None = Field(default=None, max_length=500)


class ProviderStaffRead(BaseModel):
    user_public_id: uuid.UUID
    membership_public_id: uuid.UUID
    display_name: str
    email: str | None
    mobile: str | None
    user_status: UserStatus
    membership_status: MembershipStatus
    role_code: str
    role_name: str
    employee_id: str | None
    designation: str | None
    is_technical_contact: bool
    is_primary_admin: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProviderStaffPage(BaseModel):
    items: list[ProviderStaffRead]
    total: int
    offset: int
    limit: int


class ProviderStaffMessage(BaseModel):
    message: str
