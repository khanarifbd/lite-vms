import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.common.enums import UserStatus


class AdminLoginIdentifier(BaseModel):
    public_id: uuid.UUID
    identifier_type: str
    masked_value: str
    is_primary: bool
    is_verified: bool
    disabled_at: datetime | None


class AdminStaffSummary(BaseModel):
    public_id: uuid.UUID
    display_name: str
    status: UserStatus
    role_codes: list[str]
    organization_public_id: uuid.UUID | None
    organization_name: str | None
    organization_code: str | None
    designation: str | None
    member_code: str | None
    identifiers: list[AdminLoginIdentifier]
    created_at: datetime


class AdminStaffPage(BaseModel):
    items: list[AdminStaffSummary]
    total: int
    offset: int
    limit: int


class AdminStaffCreate(BaseModel):
    display_name: str = Field(min_length=2, max_length=180)
    email: EmailStr
    mobile: str | None = Field(default=None, min_length=10, max_length=20)
    username: str | None = Field(default=None, min_length=3, max_length=80)
    temporary_password: str = Field(min_length=10, max_length=128)
    organization_public_id: uuid.UUID
    role_codes: list[str] = Field(min_length=1)
    designation: str | None = Field(default=None, max_length=140)
    member_code: str | None = Field(default=None, max_length=100)


class AdminStaffUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=180)
    status: UserStatus | None = None
    organization_public_id: uuid.UUID | None = None
    role_codes: list[str] | None = None
    designation: str | None = Field(default=None, max_length=140)
    member_code: str | None = Field(default=None, max_length=100)
    reason: str = Field(min_length=3, max_length=1000)


class AdminStaffAuditItem(BaseModel):
    id: uuid.UUID
    action: str
    actor_name: str | None
    reason: str | None
    previous_values: dict | None
    new_values: dict | None
    created_at: datetime


class AdminStaffDetail(BaseModel):
    user: AdminStaffSummary
    audit_history: list[AdminStaffAuditItem]
