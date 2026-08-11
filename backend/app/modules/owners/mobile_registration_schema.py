import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.common.enums import OwnerType
from app.modules.auth.schema import normalize_email, normalize_mobile, normalize_username
from app.modules.owners.schema import OwnerApplicationRead, OwnerDocumentCreate, OwnerProviderLinkRead


class MobileOwnerLookupRequest(BaseModel):
    owner_type: OwnerType = OwnerType.INDIVIDUAL
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("A valid mobile number is required")
        return normalized


class MobileOwnerLookupResponse(BaseModel):
    exists: bool
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None
    mobile: str
    account_exists: bool = False
    current_provider_link_status: str | None = None
    next_action: str


class ProviderMobileOwnerRegister(BaseModel):
    owner_type: OwnerType = OwnerType.INDIVIDUAL
    owner_name: str = Field(min_length=2, max_length=180)
    mobile: str
    email: str | None = Field(default=None, max_length=180)
    login_username: str | None = Field(default=None, min_length=3, max_length=50)
    contact_name: str = Field(min_length=2, max_length=180)
    temporary_password: str | None = Field(default=None, min_length=6, max_length=128)

    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)

    company_registration_number: str | None = Field(default=None, max_length=120)
    company_type: str | None = Field(default=None, max_length=80)
    incorporation_date: date | None = None
    authorized_person_name: str | None = Field(default=None, max_length=180)
    authorized_person_designation: str | None = Field(default=None, max_length=140)
    authorized_person_mobile: str | None = Field(default=None, max_length=30)
    authorized_person_email: str | None = Field(default=None, max_length=180)

    trade_license_number: str | None = Field(default=None, max_length=120)
    tin_number: str | None = Field(default=None, max_length=80)
    bin_number: str | None = Field(default=None, max_length=80)
    registered_address: str = Field(min_length=5, max_length=1000)
    district: str = Field(min_length=2, max_length=100)
    website_url: str | None = Field(default=None, max_length=500)
    documents: list[OwnerDocumentCreate] = Field(default_factory=list, max_length=20)
    declaration_accepted: bool

    @field_validator("mobile", "authorized_person_mobile")
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        normalized = normalize_mobile(value)
        if value is not None and normalized is None:
            raise ValueError("A valid mobile number is required")
        return normalized

    @field_validator("email", "authorized_person_email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator("login_username")
    @classmethod
    def validate_username(cls, value: str | None) -> str | None:
        return normalize_username(value) if value else None

    @model_validator(mode="after")
    def validate_registration(self) -> "ProviderMobileOwnerRegister":
        if not self.mobile:
            raise ValueError("Mobile number is required")
        if not self.declaration_accepted:
            raise ValueError("The vehicle-owner declaration must be accepted")
        if self.owner_type == OwnerType.COMPANY:
            if not self.company_registration_number:
                raise ValueError("Company registration number is required")
            if not self.trade_license_number:
                raise ValueError("Trade licence number is required")
        return self


class ProviderMobileOwnerRegistrationResult(BaseModel):
    owner: OwnerApplicationRead
    link: OwnerProviderLinkRead
    already_registered: bool
    primary_login_mobile: str
    email_added: bool
    username_added: bool
    must_change_password: bool
    message: str
