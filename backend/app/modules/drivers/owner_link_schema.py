import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.modules.drivers.enums import (
    DriverLicenceStatus,
    DriverLicenceType,
    DriverLinkStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.schema import (
    DriverLinkRead,
    DriverRegistrationResult,
    ManagedDriverRegister,
)


class OwnerDriverLookupRequest(BaseModel):
    nid_reference: str = Field(min_length=10, max_length=120)
    owner_id: uuid.UUID | None = None


class OwnerDriverLinkRequest(BaseModel):
    driver_id: uuid.UUID
    owner_id: uuid.UUID | None = None


class ProviderOwnerDriverRegister(ManagedDriverRegister):
    owner_id: uuid.UUID


class OwnerDriverLookupResponse(BaseModel):
    exists: bool
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    masked_nid_reference: str | None = None
    masked_mobile: str | None = None
    masked_licence_number: str | None = None
    licence_type: DriverLicenceType | None = None
    licence_expiry_date: date | None = None
    driver_verification_status: DriverVerificationStatus | None = None
    licence_verification_status: DriverLicenceStatus | None = None
    owner_link_status: DriverLinkStatus | None = None
    provider_link_status: DriverLinkStatus | None = None
    can_send_request: bool
    next_action: str


class OwnerDriverLinkRequestResult(BaseModel):
    owner_link: DriverLinkRead
    provider_link: DriverLinkRead | None = None
    created_owner_link: bool
    created_provider_link: bool
    message: str


class ProviderOwnerDriverRegistrationResult(BaseModel):
    registration: DriverRegistrationResult
    owner_link: DriverLinkRead
    provider_link: DriverLinkRead


class OwnerDriverLinkPage(BaseModel):
    items: list[DriverLinkRead]
    total: int
    offset: int
    limit: int
