import uuid
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel

from app.common.enums import DocumentStatus, DocumentType


class DocumentExpiryStatus(StrEnum):
    NOT_APPLICABLE = "not_applicable"
    VALID = "valid"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"


class ProviderVehicleDocumentRead(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    document_type: DocumentType
    document_number: str | None
    issued_at: date | None
    expires_at: date | None
    verification_status: DocumentStatus
    effective_status: DocumentStatus
    expiry_status: DocumentExpiryStatus
    source: str
    file_name: str | None
    content_type: str | None
    size_bytes: int | None
    version: int
    is_active: bool
    replaced_by_id: uuid.UUID | None
    verified_at: datetime | None
    review_notes: str | None
    download_url: str
    created_at: datetime
    updated_at: datetime


class ProviderVehicleDocumentPage(BaseModel):
    items: list[ProviderVehicleDocumentRead]
    total: int
    active_count: int
    history_count: int
