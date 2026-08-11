import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.enums import (
    EntityStatus,
    OwnerDocumentStatus,
    OwnerDocumentType,
    OwnerReviewDecision,
    OwnerType,
    OwnerVerificationStatus,
)
from app.modules.auth.schema import normalize_email, normalize_mobile, normalize_username
from app.modules.owners.enums import (
    OwnerClaimStatus,
    OwnerProviderLinkDecision,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
)


class OwnerDocumentCreate(BaseModel):
    document_type: OwnerDocumentType
    document_reference: str | None = Field(default=None, max_length=160)
    storage_key: str = Field(min_length=3, max_length=500)
    file_url: str | None = Field(default=None, max_length=1000)
    file_name: str | None = Field(default=None, max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)
    expires_at: datetime | None = None


class OwnerDocumentRead(OwnerDocumentCreate):
    id: uuid.UUID
    status: OwnerDocumentStatus
    version: int
    is_active: bool
    replaced_by_id: uuid.UUID | None
    verified_at: datetime | None
    review_notes: str | None


class OwnerRegister(BaseModel):
    owner_type: OwnerType = OwnerType.INDIVIDUAL
    owner_name: str = Field(min_length=2, max_length=180)
    identity_or_registration_reference: str = Field(min_length=3, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=180)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    profile_photo_storage_key: str | None = Field(default=None, max_length=500)
    present_address: str | None = Field(default=None, max_length=1000)
    permanent_address: str | None = Field(default=None, max_length=1000)
    division: str | None = Field(default=None, max_length=100)
    upazila: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    alternate_phone: str | None = Field(default=None, max_length=30)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    authorized_person_name: str | None = Field(default=None, max_length=180)
    authorized_person_nid: str | None = Field(default=None, max_length=120)
    authorized_person_designation: str | None = Field(default=None, max_length=140)
    authorized_person_mobile: str | None = Field(default=None, max_length=30)
    authorized_person_email: str | None = Field(default=None, max_length=180)
    company_logo_storage_key: str | None = Field(default=None, max_length=500)
    head_office_address: str | None = Field(default=None, max_length=1000)
    operating_address: str | None = Field(default=None, max_length=1000)
    trade_license_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str = Field(min_length=5, max_length=1000)
    district: str = Field(min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)
    documents: list[OwnerDocumentCreate] = Field(default_factory=list, max_length=20)
    declaration_accepted: bool
    admin_full_name: str = Field(min_length=2, max_length=180)
    admin_email: str
    admin_mobile: str | None = Field(default=None, max_length=30)
    admin_username: str | None = Field(default=None, min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)

    @field_validator("phone", "alternate_phone", "authorized_person_mobile", "admin_mobile")
    @classmethod
    def validate_optional_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("email", "authorized_person_email", "admin_email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator("admin_username")
    @classmethod
    def validate_admin_username(cls, value: str | None) -> str | None:
        return normalize_username(value) if value else None

    @model_validator(mode="after")
    def validate_owner_requirements(self) -> "OwnerRegister":
        if not self.declaration_accepted:
            raise ValueError("The vehicle-owner declaration must be accepted")
        if self.owner_type == OwnerType.COMPANY:
            if not self.trade_license_number:
                raise ValueError("Trade licence number is required")
        return self


class ProviderOwnerRegister(OwnerRegister):
    contact_name: str = Field(min_length=2, max_length=180)
    contact_email: str
    contact_mobile: str | None = Field(default=None, max_length=30)
    login_username: str | None = Field(default=None, min_length=3, max_length=50)
    temporary_password: str | None = Field(default=None, min_length=6, max_length=128)

    @field_validator("contact_email")
    @classmethod
    def validate_contact_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("contact_mobile")
    @classmethod
    def validate_contact_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("login_username")
    @classmethod
    def validate_login_username(cls, value: str | None) -> str | None:
        return normalize_username(value) if value else None


class OwnerLookupRequest(BaseModel):
    owner_type: OwnerType
    identity_or_registration_reference: str = Field(min_length=3, max_length=120)


class OwnerAccountResetResult(BaseModel):
    owner_id: uuid.UUID
    owner_name: str
    username: str
    phone: str | None
    must_change_password: bool
    message: str


class OwnerTemporaryPasswordReset(BaseModel):
    identity_or_registration_reference: str = Field(min_length=3, max_length=120)
    username: str = Field(min_length=3, max_length=180)
    temporary_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class OwnerApplicationUpdate(BaseModel):
    owner_name: str | None = Field(default=None, min_length=2, max_length=180)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=180)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    profile_photo_storage_key: str | None = Field(default=None, max_length=500)
    present_address: str | None = Field(default=None, max_length=1000)
    permanent_address: str | None = Field(default=None, max_length=1000)
    division: str | None = Field(default=None, max_length=100)
    upazila: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    alternate_phone: str | None = Field(default=None, max_length=30)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    authorized_person_name: str | None = Field(default=None, max_length=180)
    authorized_person_nid: str | None = Field(default=None, max_length=120)
    authorized_person_designation: str | None = Field(default=None, max_length=140)
    authorized_person_mobile: str | None = Field(default=None, max_length=30)
    authorized_person_email: str | None = Field(default=None, max_length=180)
    company_logo_storage_key: str | None = Field(default=None, max_length=500)
    head_office_address: str | None = Field(default=None, max_length=1000)
    operating_address: str | None = Field(default=None, max_length=1000)
    trade_license_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str | None = Field(default=None, min_length=5, max_length=1000)
    district: str | None = Field(default=None, min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)
    documents: list[OwnerDocumentCreate] | None = Field(default=None, max_length=20)
    declaration_accepted: bool | None = None

    @field_validator("phone", "alternate_phone", "authorized_person_mobile")
    @classmethod
    def validate_optional_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("email", "authorized_person_email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None


class OwnerReview(BaseModel):
    decision: OwnerReviewDecision
    notes: str = Field(min_length=3, max_length=1000)


class ProviderLinkSummary(BaseModel):
    provider_id: uuid.UUID
    provider_code: str
    provider_name: str
    status: OwnerProviderLinkStatus


class OwnerApplicationRead(BaseModel):
    id: uuid.UUID
    application_number: str
    owner_code: str
    tenant_public_id: uuid.UUID
    organization_public_id: uuid.UUID
    primary_admin_user_public_id: uuid.UUID | None
    created_by_provider_id: uuid.UUID | None
    created_by_provider_name: str | None = None
    owner_type: OwnerType
    owner_name: str
    identity_or_registration_reference: str
    claim_status: OwnerClaimStatus
    date_of_birth: date | None
    father_name: str | None
    mother_name: str | None
    gender: str | None
    profile_photo_storage_key: str | None
    present_address: str | None
    permanent_address: str | None
    division: str | None
    upazila: str | None
    postal_code: str | None
    alternate_phone: str | None
    company_type: str | None
    incorporation_date: date | None
    authorized_person_name: str | None
    authorized_person_nid: str | None
    authorized_person_designation: str | None
    authorized_person_mobile: str | None
    authorized_person_email: str | None
    company_logo_storage_key: str | None
    head_office_address: str | None
    operating_address: str | None
    trade_license_number: str | None
    tin_number: str | None
    bin_number: str | None
    phone: str | None
    email: str | None
    account_username: str | None = None
    account_status: str | None = None
    registered_address: str
    district: str
    website_url: str | None
    documents: list[OwnerDocumentRead]
    linked_providers: list[ProviderLinkSummary]
    total_vehicles: int = 0
    active_vehicles: int = 0
    linked_drivers_count: int = 0
    active_vts_providers_count: int = 0
    primary_vts_provider: ProviderLinkSummary | None = None
    declaration_accepted: bool
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_notes: str | None
    verification_status: OwnerVerificationStatus
    status: EntityStatus
    created_at: datetime
    updated_at: datetime


class OwnerRegistrationResult(BaseModel):
    owner: OwnerApplicationRead
    account_can_login: bool
    claimed_existing_record: bool
    message: str


class OwnerLookupResponse(BaseModel):
    exists: bool
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None
    identity_or_registration_reference: str | None = None
    phone: str | None = None
    username: str | None = None
    account_exists: bool = False
    claim_status: OwnerClaimStatus | None = None
    verification_status: OwnerVerificationStatus | None = None
    current_provider_link_status: OwnerProviderLinkStatus | None = None
    linked_providers: list[ProviderLinkSummary] = Field(default_factory=list)
    next_action: str


class OwnerProviderLinkRead(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    identity_or_registration_reference: str
    provider_id: uuid.UUID
    provider_code: str
    provider_name: str
    status: OwnerProviderLinkStatus
    requested_by: OwnerProviderRequestSource
    requested_at: datetime
    responded_at: datetime | None
    ended_at: datetime | None
    reason: str | None
    created_at: datetime
    updated_at: datetime


class ProviderOwnerRegistrationResult(BaseModel):
    owner: OwnerApplicationRead
    link: OwnerProviderLinkRead
    already_registered: bool
    login_username: str | None
    must_change_password: bool
    message: str


class OwnerProviderLinkRequest(BaseModel):
    provider_id: uuid.UUID


class OwnerProviderLinkResponse(BaseModel):
    decision: OwnerProviderLinkDecision
    notes: str | None = Field(default=None, max_length=1000)


class OwnerProviderUnlink(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class OwnerProviderLinkPage(BaseModel):
    items: list[OwnerProviderLinkRead]
    total: int
    offset: int
    limit: int


class OwnerPage(BaseModel):
    items: list[OwnerApplicationRead]
    total: int
    offset: int
    limit: int
