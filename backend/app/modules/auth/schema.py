import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.enums import (
    IdentifierType,
    IdentityAssuranceLevel,
    IdentityVerificationStatus,
    MembershipStatus,
    UserStatus,
)


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise ValueError("A valid email address is required")
    return normalized


def normalize_mobile(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = "".join(
        character for character in value.strip() if character.isdigit() or character == "+"
    )
    if normalized.startswith("01") and len(normalized) == 11:
        normalized = "+88" + normalized
    if not normalized.startswith("+") or len(normalized) < 10 or len(normalized) > 16:
        raise ValueError("Mobile number must use international format, for example +8801712345678")
    return normalized


def normalize_username(value: str) -> str:
    normalized = value.strip().lower()
    if not re.fullmatch(r"[a-z][a-z0-9._-]{2,49}", normalized):
        raise ValueError(
            "Username must start with a letter and contain 3-50 lowercase letters, "
            "numbers, dots, underscores, or hyphens"
        )
    return normalized


class IdentifierRead(BaseModel):
    public_id: uuid.UUID
    identifier_type: IdentifierType
    value: str
    masked_value: str | None = None
    is_primary: bool
    is_verified: bool
    verified_at: datetime | None


class MembershipRead(BaseModel):
    public_id: uuid.UUID
    tenant_public_id: uuid.UUID
    tenant_name: str
    organization_public_id: uuid.UUID
    organization_name: str
    organization_code: str
    status: MembershipStatus
    member_code: str | None
    designation: str | None
    is_primary: bool
    role_codes: list[str]
    valid_from: datetime
    valid_to: datetime | None


class UserRead(BaseModel):
    public_id: uuid.UUID
    display_name: str
    username: str | None = None
    email: str | None = None
    mobile: str | None = None
    status: UserStatus
    preferred_language: str
    timezone: str
    identity_verification_status: IdentityVerificationStatus
    identity_assurance_level: IdentityAssuranceLevel
    email_verified: bool = False
    mobile_verified: bool = False
    must_change_password: bool = False
    last_login_at: datetime | None = None
    primary_role: str | None = None
    primary_tenant_public_id: uuid.UUID | None = None
    primary_tenant_name: str | None = None
    identifiers: list[IdentifierRead]
    memberships: list[MembershipRead]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class UserPage(BaseModel):
    items: list[UserRead]
    total: int
    offset: int
    limit: int


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=5, max_length=180)
    mobile: str = Field(min_length=10, max_length=30)
    full_name: str = Field(min_length=2, max_length=180)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("Mobile number is required")
        return normalized


class UserAdminCreate(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    mobile: str | None = None
    full_name: str = Field(min_length=2, max_length=180)
    password: str = Field(min_length=12, max_length=128)
    tenant_public_id: uuid.UUID
    organization_public_id: uuid.UUID
    role_codes: list[str] = Field(min_length=1)
    member_code: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=140)
    status: UserStatus = UserStatus.ACTIVE
    must_change_password: bool = True

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=180)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    mobile: str | None = None
    status: UserStatus | None = None
    preferred_language: str | None = Field(default=None, min_length=2, max_length=12)
    timezone: str | None = Field(default=None, min_length=3, max_length=64)
    identity_verification_status: IdentityVerificationStatus | None = None
    identity_assurance_level: IdentityAssuranceLevel | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value is not None else None

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)


class UserSelfUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=180)
    preferred_language: str | None = Field(default=None, min_length=2, max_length=12)
    timezone: str | None = Field(default=None, min_length=3, max_length=64)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=12, max_length=128)
    must_change_password: bool = True
    reason: str | None = Field(default=None, max_length=500)


class MembershipCreate(BaseModel):
    tenant_public_id: uuid.UUID
    organization_public_id: uuid.UUID
    role_codes: list[str] = Field(min_length=1)
    member_code: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=140)
    is_primary: bool = False


class MembershipUpdate(BaseModel):
    status: MembershipStatus | None = None
    role_codes: list[str] | None = None
    member_code: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=140)
    is_primary: bool | None = None


class RegistrationResult(BaseModel):
    user: UserRead
    can_login: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    session_public_id: uuid.UUID
    must_change_password: bool
    user: UserRead


class RoleRead(BaseModel):
    public_id: uuid.UUID
    code: str
    name: str
    description: str | None
    is_system: bool
    is_active: bool
    permission_codes: list[str]


class MessageResponse(BaseModel):
    message: str
