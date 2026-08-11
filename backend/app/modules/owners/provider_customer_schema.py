import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.enums import IdentifierType, OwnerVerificationStatus
from app.modules.auth.admin_schema import UserAdminRead
from app.modules.auth.schema import normalize_email, normalize_mobile, normalize_username
from app.modules.owners.schema import (
    OwnerApplicationRead,
    OwnerDocumentCreate,
    OwnerProviderLinkRead,
)


class ProviderOwnerCustomerSummary(BaseModel):
    provider_id: uuid.UUID
    total: int
    active: int
    pending_owner_approval: int
    pending_provider_approval: int
    rejected: int
    ended: int
    suspended: int


class ProviderOwnerCustomerRead(BaseModel):
    link: OwnerProviderLinkRead
    owner: OwnerApplicationRead
    account: UserAdminRead | None
    can_manage: bool


class ProviderOwnerCustomerPage(BaseModel):
    items: list[ProviderOwnerCustomerRead]
    total: int
    offset: int
    limit: int


class ProviderManagedOwnerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_name: str | None = Field(default=None, min_length=2, max_length=180)
    trade_license_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str | None = Field(default=None, min_length=5, max_length=1000)
    district: str | None = Field(default=None, min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)
    documents: list[OwnerDocumentCreate] | None = Field(default=None, min_length=1, max_length=20)

    display_name: str | None = Field(default=None, min_length=2, max_length=180)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    mobile: str | None = Field(default=None, min_length=10, max_length=30)
    username: str | None = Field(default=None, min_length=3, max_length=50)
    preferred_language: str | None = Field(default=None, min_length=2, max_length=12)
    timezone: str | None = Field(default=None, min_length=3, max_length=64)
    primary_identifier_type: IdentifierType | None = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value is not None else None

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return normalize_username(value) if value is not None else None


class ProviderManagedOwnerUpdateResult(BaseModel):
    customer: ProviderOwnerCustomerRead
    reverification_required: bool
    verification_status: OwnerVerificationStatus
    updated_at: datetime
