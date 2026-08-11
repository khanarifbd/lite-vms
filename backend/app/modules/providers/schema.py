import ipaddress
import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.enums import (
    ProviderDocumentStatus,
    ProviderDocumentType,
    ProviderReviewDecision,
    ProviderStatus,
)
from app.modules.auth.schema import normalize_email, normalize_mobile


class ProviderDocumentCreate(BaseModel):
    document_type: ProviderDocumentType
    document_number: str | None = Field(default=None, max_length=160)
    storage_key: str = Field(min_length=3, max_length=500)
    file_name: str | None = Field(default=None, max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)
    expires_at: datetime | None = None


class ProviderDocumentRead(ProviderDocumentCreate):
    id: uuid.UUID
    status: ProviderDocumentStatus
    version: int
    is_active: bool
    replaced_by_id: uuid.UUID | None
    verified_at: datetime | None
    review_notes: str | None


class ProviderRegister(BaseModel):
    legal_name: str = Field(min_length=2, max_length=180)
    trade_name: str | None = Field(default=None, max_length=180)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    btrc_license_number: str = Field(min_length=2, max_length=100)
    btrc_license_issue_date: date | None = None
    btrc_license_expiry_date: date | None = None
    trade_license_number: str = Field(min_length=2, max_length=120)
    trade_license_expiry_date: date | None = None
    company_registration_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str = Field(min_length=5, max_length=1000)
    district: str = Field(min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)

    authorized_representative_name: str | None = Field(default=None, max_length=180)
    authorized_representative_nid: str | None = Field(default=None, max_length=120)
    authorized_representative_designation: str | None = Field(default=None, max_length=140)
    authorized_representative_mobile: str | None = Field(default=None, max_length=30)
    authorized_representative_email: str | None = Field(default=None, max_length=180)

    technical_contact_name: str = Field(min_length=2, max_length=120)
    technical_contact_email: str = Field(min_length=5, max_length=180)
    technical_contact_mobile: str = Field(min_length=10, max_length=30)
    operations_contact_name: str | None = Field(default=None, max_length=120)
    operations_contact_phone: str | None = Field(default=None, max_length=30)
    operations_contact_email: str | None = Field(default=None, max_length=180)
    support_contact_name: str | None = Field(default=None, max_length=120)
    support_contact_phone: str | None = Field(default=None, max_length=30)
    support_contact_email: str | None = Field(default=None, max_length=180)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    emergency_contact_email: str | None = Field(default=None, max_length=180)

    service_coverage: list[str] = Field(default_factory=list, max_length=100)
    supported_protocols: list[str] = Field(default_factory=list, max_length=100)
    supported_device_brands: list[str] = Field(default_factory=list, max_length=100)
    api_base_url: str | None = Field(default=None, max_length=500)
    estimated_vehicle_count: int = Field(default=0, ge=0, le=100_000_000)
    current_platform_name: str | None = Field(default=None, max_length=180)
    data_submission_interval_seconds: int | None = Field(default=None, ge=1, le=3600)
    integration_status: str | None = Field(default=None, max_length=40)
    allowed_server_ips: list[str] = Field(default_factory=list, max_length=50)
    documents: list[ProviderDocumentCreate] = Field(min_length=2, max_length=30)
    declaration_accepted: bool

    @field_validator(
        "technical_contact_email",
        "authorized_representative_email",
        "operations_contact_email",
        "support_contact_email",
        "emergency_contact_email",
    )
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator(
        "technical_contact_mobile",
        "authorized_representative_mobile",
        "operations_contact_phone",
        "support_contact_phone",
        "emergency_contact_phone",
    )
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("service_coverage", "supported_protocols", "supported_device_brands")
    @classmethod
    def normalize_list_values(cls, values: list[str]) -> list[str]:
        return sorted({value.strip() for value in values if value.strip()})

    @field_validator("allowed_server_ips")
    @classmethod
    def validate_allowed_ips(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            try:
                parsed = ipaddress.ip_address(value.strip())
            except ValueError as exc:
                raise ValueError(f"Invalid server IP address: {value}") from exc
            canonical = str(parsed)
            if canonical not in normalized:
                normalized.append(canonical)
        return normalized

    @model_validator(mode="after")
    def validate_application(self) -> "ProviderRegister":
        if not self.declaration_accepted:
            raise ValueError("The application declaration must be accepted")
        document_types = {document.document_type for document in self.documents}
        required = {ProviderDocumentType.BTRC_LICENSE, ProviderDocumentType.TRADE_LICENSE}
        missing = sorted(item.value for item in required - document_types)
        if missing:
            raise ValueError(f"Required documents are missing: {', '.join(missing)}")
        return self


class ProviderAdminCreate(ProviderRegister):
    primary_admin_user_public_id: uuid.UUID


class ProviderApplicationUpdate(BaseModel):
    legal_name: str | None = Field(default=None, min_length=2, max_length=180)
    trade_name: str | None = Field(default=None, max_length=180)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    btrc_license_number: str | None = Field(default=None, min_length=2, max_length=100)
    btrc_license_issue_date: date | None = None
    btrc_license_expiry_date: date | None = None
    trade_license_number: str | None = Field(default=None, min_length=2, max_length=120)
    trade_license_expiry_date: date | None = None
    company_registration_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str | None = Field(default=None, min_length=5, max_length=1000)
    district: str | None = Field(default=None, min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)
    authorized_representative_name: str | None = Field(default=None, max_length=180)
    authorized_representative_nid: str | None = Field(default=None, max_length=120)
    authorized_representative_designation: str | None = Field(default=None, max_length=140)
    authorized_representative_mobile: str | None = Field(default=None, max_length=30)
    authorized_representative_email: str | None = Field(default=None, max_length=180)
    technical_contact_name: str | None = Field(default=None, min_length=2, max_length=120)
    technical_contact_email: str | None = Field(default=None, min_length=5, max_length=180)
    technical_contact_mobile: str | None = Field(default=None, min_length=10, max_length=30)
    operations_contact_name: str | None = Field(default=None, max_length=120)
    operations_contact_phone: str | None = Field(default=None, max_length=30)
    operations_contact_email: str | None = Field(default=None, max_length=180)
    support_contact_name: str | None = Field(default=None, max_length=120)
    support_contact_phone: str | None = Field(default=None, max_length=30)
    support_contact_email: str | None = Field(default=None, max_length=180)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    emergency_contact_email: str | None = Field(default=None, max_length=180)
    service_coverage: list[str] | None = Field(default=None, max_length=100)
    supported_protocols: list[str] | None = Field(default=None, max_length=100)
    supported_device_brands: list[str] | None = Field(default=None, max_length=100)
    api_base_url: str | None = Field(default=None, max_length=500)
    estimated_vehicle_count: int | None = Field(default=None, ge=0, le=100_000_000)
    current_platform_name: str | None = Field(default=None, max_length=180)
    data_submission_interval_seconds: int | None = Field(default=None, ge=1, le=3600)
    integration_status: str | None = Field(default=None, max_length=40)
    allowed_server_ips: list[str] | None = Field(default=None, max_length=50)
    documents: list[ProviderDocumentCreate] | None = Field(default=None, min_length=2, max_length=30)
    declaration_accepted: bool | None = None

    @field_validator(
        "technical_contact_email",
        "authorized_representative_email",
        "operations_contact_email",
        "support_contact_email",
        "emergency_contact_email",
    )
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator(
        "technical_contact_mobile",
        "authorized_representative_mobile",
        "operations_contact_phone",
        "support_contact_phone",
        "emergency_contact_phone",
    )
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("allowed_server_ips")
    @classmethod
    def validate_allowed_ips(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return [str(ipaddress.ip_address(value.strip())) for value in dict.fromkeys(values)]

    @model_validator(mode="after")
    def validate_documents(self) -> "ProviderApplicationUpdate":
        if self.declaration_accepted is False:
            raise ValueError("The application declaration must be accepted")
        if self.documents is not None:
            document_types = {document.document_type for document in self.documents}
            required = {ProviderDocumentType.BTRC_LICENSE, ProviderDocumentType.TRADE_LICENSE}
            missing = sorted(item.value for item in required - document_types)
            if missing:
                raise ValueError(f"Required documents are missing: {', '.join(missing)}")
        return self


class ProviderReview(BaseModel):
    decision: ProviderReviewDecision
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_notes(self) -> "ProviderReview":
        if self.decision != ProviderReviewDecision.APPROVE and not self.notes:
            raise ValueError("Review notes are required when not approving an application")
        return self


class ProviderApplicationRead(BaseModel):
    id: uuid.UUID
    application_number: str
    code: str
    tenant_public_id: uuid.UUID
    organization_public_id: uuid.UUID
    primary_admin_user_public_id: uuid.UUID
    legal_name: str
    trade_name: str | None
    company_type: str | None
    incorporation_date: date | None
    btrc_license_number: str
    btrc_license_issue_date: date | None
    btrc_license_expiry_date: date | None
    trade_license_number: str
    trade_license_expiry_date: date | None
    company_registration_number: str | None
    tin_number: str | None
    bin_number: str | None
    registered_address: str
    district: str
    website_url: str | None
    authorized_representative_name: str | None
    authorized_representative_nid: str | None
    authorized_representative_designation: str | None
    authorized_representative_mobile: str | None
    authorized_representative_email: str | None
    contact_person: str
    phone: str
    email: str
    technical_contact_name: str
    technical_contact_phone: str
    technical_contact_email: str
    operations_contact_name: str | None
    operations_contact_phone: str | None
    operations_contact_email: str | None
    support_contact_name: str | None
    support_contact_phone: str | None
    support_contact_email: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    emergency_contact_email: str | None
    service_coverage: list[str]
    supported_protocols: list[str]
    supported_device_brands: list[str]
    api_base_url: str | None
    estimated_vehicle_count: int
    current_platform_name: str | None
    data_submission_interval_seconds: int | None
    integration_status: str | None
    last_telemetry_received_at: datetime | None
    allowed_server_ips: list[str]
    documents: list[ProviderDocumentRead]
    linked_owner_count: int = 0
    registered_device_count: int = 0
    active_vehicle_count: int = 0
    online_vehicle_count: int = 0
    telemetry_source_id: uuid.UUID | None = None
    telemetry_source_code: str | None = None
    telemetry_source_status: str | None = None
    provider_staff_count: int = 0
    declaration_accepted: bool
    submitted_at: datetime
    reviewed_at: datetime | None
    review_notes: str | None
    status: ProviderStatus
    created_at: datetime
    updated_at: datetime


class ProviderRegistrationResult(BaseModel):
    provider: ProviderApplicationRead
    account_can_login: bool
    message: str


class ProviderPage(BaseModel):
    items: list[ProviderApplicationRead]
    total: int
    offset: int
    limit: int
