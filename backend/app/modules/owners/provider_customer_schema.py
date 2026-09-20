import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.common.enums import IdentifierType, OwnerType, OwnerVerificationStatus
from app.modules.auth.admin_schema import UserAdminRead
from app.modules.auth.schema import normalize_email, normalize_mobile, normalize_username
from app.modules.owners.enums import OwnerProviderLinkStatus
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


class ProviderOwnerOption(BaseModel):
    id: uuid.UUID
    owner_name: str
    owner_code: str | None
    identity_reference: str
    phone: str | None


class ProviderOwnerPortfolioLink(BaseModel):
    id: uuid.UUID
    status: OwnerProviderLinkStatus


class ProviderOwnerPortfolioOwner(BaseModel):
    id: uuid.UUID
    application_number: str | None
    owner_code: str | None
    owner_type: OwnerType
    owner_name: str
    identity_or_registration_reference: str
    email: str | None
    phone: str | None
    district: str | None
    verification_status: OwnerVerificationStatus
    total_vehicles: int
    active_vehicles: int


class ProviderOwnerPortfolioItem(BaseModel):
    link: ProviderOwnerPortfolioLink
    owner: ProviderOwnerPortfolioOwner
    can_manage: bool


class ProviderOwnerPortfolioPage(BaseModel):
    items: list[ProviderOwnerPortfolioItem]
    total: int
    offset: int
    limit: int


class ProviderOwnerCustomerRead(BaseModel):
    link: OwnerProviderLinkRead
    owner: OwnerApplicationRead
    account: UserAdminRead | None
    can_manage: bool
    can_reset_password: bool = False


class ProviderOwnerCustomerPage(BaseModel):
    items: list[ProviderOwnerCustomerRead]
    total: int
    offset: int
    limit: int


class ProviderOwnerPasswordReset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str = Field(min_length=6, max_length=128)
    reason: str = Field(min_length=10, max_length=500)


class ProviderManagedOwnerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_name: str | None = Field(default=None, min_length=2, max_length=180)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    authorized_person_name: str | None = Field(default=None, max_length=180)
    authorized_person_designation: str | None = Field(default=None, max_length=140)
    authorized_person_mobile: str | None = Field(default=None, max_length=30)
    authorized_person_email: str | None = Field(default=None, max_length=180)
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
