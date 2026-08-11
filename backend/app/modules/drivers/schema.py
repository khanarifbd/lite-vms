import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.enums import EntityStatus
from app.modules.auth.schema import normalize_email, normalize_mobile, normalize_username
from app.modules.drivers.enums import (
    DriverClaimStatus,
    DriverDocumentStatus,
    DriverDocumentType,
    DriverLicenceStatus,
    DriverLicenceType,
    DriverLinkDecision,
    DriverLinkSource,
    DriverLinkStatus,
    DriverProfileChangeStatus,
    DriverReviewDecision,
    DriverVerificationStatus,
)


class DriverDocumentCreate(BaseModel):
    document_type: DriverDocumentType
    document_reference: str | None = Field(default=None, max_length=160)
    storage_key: str = Field(min_length=3, max_length=500)
    file_name: str | None = Field(default=None, max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)
    expires_at: datetime | None = None


class DriverDocumentRead(DriverDocumentCreate):
    id: uuid.UUID
    file_url: str | None = None
    status: DriverDocumentStatus
    version: int
    is_active: bool
    replaced_by_id: uuid.UUID | None
    verified_at: datetime | None
    review_notes: str | None


class DriverDetails(BaseModel):
    full_name: str = Field(min_length=2, max_length=180)
    nid_reference: str = Field(min_length=10, max_length=120)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=10)
    email: str = Field(min_length=5, max_length=180)
    mobile: str = Field(min_length=10, max_length=30)
    emergency_contact_name: str | None = Field(default=None, max_length=180)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    present_address: str = Field(min_length=5, max_length=1000)
    permanent_address: str | None = Field(default=None, max_length=1000)
    district: str = Field(min_length=2, max_length=100)
    photo_url: str | None = Field(default=None, max_length=1000)
    employment_type: str | None = Field(default=None, max_length=60)
    shift_information: str | None = Field(default=None, max_length=1000)
    medical_fitness_expiry_date: date | None = None
    licence_number: str = Field(min_length=3, max_length=100)
    licence_type: DriverLicenceType
    vehicle_classes: list[str] = Field(min_length=1, max_length=30)
    first_issue_date: date | None = None
    issue_date: date | None = None
    licence_expiry_date: date
    documents: list[DriverDocumentCreate] = Field(min_length=3, max_length=20)
    declaration_accepted: bool

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("mobile", "emergency_contact_phone")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("vehicle_classes")
    @classmethod
    def normalize_classes(cls, values: list[str]) -> list[str]:
        classes = sorted({value.strip().upper() for value in values if value.strip()})
        if not classes:
            raise ValueError("At least one BRTA vehicle class is required")
        return classes

    @model_validator(mode="after")
    def validate_driver_details(self) -> "DriverDetails":
        if not self.declaration_accepted:
            raise ValueError("The driver declaration must be accepted")
        required = {
            DriverDocumentType.NATIONAL_ID_FRONT,
            DriverDocumentType.DRIVING_LICENCE_FRONT,
            DriverDocumentType.DRIVER_PHOTO,
        }
        document_types = {document.document_type for document in self.documents}
        missing = sorted(item.value for item in required - document_types)
        if missing:
            raise ValueError(f"Required driver documents are missing: {', '.join(missing)}")
        if self.issue_date and self.licence_expiry_date <= self.issue_date:
            raise ValueError("Licence expiry date must be after issue date")
        return self


class DriverSelfRegister(DriverDetails):
    login_username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("login_username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        return normalize_username(value)


class ManagedDriverRegister(DriverDetails):
    login_username: str | None = Field(default=None, min_length=3, max_length=64)
    temporary_password: str | None = Field(default=None, min_length=12, max_length=128)

    @field_validator("login_username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return normalize_username(value) if value else None


class DriverLookupRequest(BaseModel):
    nid_reference: str = Field(min_length=10, max_length=120)


class DriverAccountRead(BaseModel):
    user_public_id: uuid.UUID
    display_name: str
    username: str | None
    email: str
    mobile: str
    must_change_password: bool


class DriverLicenceRead(BaseModel):
    id: uuid.UUID
    licence_number: str
    licence_type: DriverLicenceType
    vehicle_classes: list[str]
    first_issue_date: date | None
    issue_date: date | None
    expiry_date: date
    issuing_authority: str
    verification_status: DriverLicenceStatus
    verified_at: datetime | None
    review_notes: str | None


class DriverLinkSummary(BaseModel):
    link_id: uuid.UUID
    organization_type: DriverLinkSource
    organization_id: uuid.UUID
    organization_name: str
    status: DriverLinkStatus


class DriverRead(BaseModel):
    id: uuid.UUID
    driver_code: str
    full_name: str
    nid_reference: str | None
    date_of_birth: date | None
    father_name: str | None
    mother_name: str | None
    gender: str | None
    blood_group: str | None
    mobile: str
    email: str
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    present_address: str
    permanent_address: str | None
    district: str
    photo_url: str | None
    employment_type: str | None
    shift_information: str | None
    medical_fitness_expiry_date: date | None
    suspension_reason: str | None
    current_vehicle_id: uuid.UUID | None = None
    current_vehicle_registration: str | None = None
    current_assignment_id: uuid.UUID | None = None
    current_assignment_is_on_duty: bool = False
    current_assignment_started_at: datetime | None = None
    current_owner_name: str | None = None
    current_provider_name: str | None = None
    claim_status: DriverClaimStatus
    verification_status: DriverVerificationStatus
    behaviour_score: float
    licence: DriverLicenceRead
    documents: list[DriverDocumentRead]
    links: list[DriverLinkSummary]
    account: DriverAccountRead
    status: EntityStatus
    submitted_at: datetime
    reviewed_at: datetime | None
    review_notes: str | None
    application_locked: bool
    profile_change_status: DriverProfileChangeStatus | None
    profile_change_submitted_at: datetime | None
    profile_change_reviewed_at: datetime | None
    profile_change_review_notes: str | None
    created_at: datetime
    updated_at: datetime


class DriverRegistrationResult(BaseModel):
    driver: DriverRead
    already_registered: bool
    login_username: str | None = None
    must_change_password: bool
    message: str


class DriverLookupResponse(BaseModel):
    exists: bool
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    nid_reference: str | None = None
    mobile: str | None = None
    verification_status: DriverVerificationStatus | None = None
    current_link_status: DriverLinkStatus | None = None
    next_action: str


class DriverReview(BaseModel):
    decision: DriverReviewDecision
    notes: str = Field(min_length=3, max_length=2000)


class DriverLinkRead(BaseModel):
    id: uuid.UUID
    driver_id: uuid.UUID
    driver_name: str
    organization_type: DriverLinkSource
    organization_id: uuid.UUID
    organization_name: str
    status: DriverLinkStatus
    requested_by: DriverLinkSource
    requested_at: datetime
    responded_at: datetime | None
    ended_at: datetime | None
    reason: str | None


class DriverLinkResponse(BaseModel):
    decision: DriverLinkDecision
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_rejection_reason(self) -> "DriverLinkResponse":
        if self.decision == DriverLinkDecision.REJECT and (
            self.notes is None or len(self.notes.strip()) < 3
        ):
            raise ValueError("A rejection reason of at least 3 characters is required")
        return self


class DriverPage(BaseModel):
    items: list[DriverRead]
    total: int
    offset: int
    limit: int


class DriverMobilePasswordResetRequest(BaseModel):
    nid_reference: str = Field(min_length=10, max_length=120)
    mobile: str = Field(min_length=10, max_length=30)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("Mobile is required")
        return normalized


class DriverMobilePasswordResetConfirm(BaseModel):
    challenge_id: uuid.UUID
    otp: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=12, max_length=128)


class DriverMobilePasswordResetRequestResult(BaseModel):
    challenge_id: uuid.UUID
    mobile: str
    expires_in_seconds: int
    delivery_status: str
    development_otp: str | None = None
    message: str


class DriverMobilePasswordResetResult(BaseModel):
    driver_id: uuid.UUID
    driver_name: str
    username: str | None
    mobile: str
    must_change_password: bool
    message: str
