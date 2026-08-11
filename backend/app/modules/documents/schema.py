import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import DocumentStatus, DocumentType


class VehicleDocumentCreate(BaseModel):
    vehicle_id: uuid.UUID
    document_type: DocumentType
    document_number: str | None = Field(default=None, max_length=120)
    issued_at: date | None = None
    expires_at: date | None = None
    status: DocumentStatus = DocumentStatus.PENDING_VERIFICATION
    source: str = Field(default="manual", max_length=60)
    storage_key: str = Field(min_length=3, max_length=500)
    file_name: str | None = Field(default=None, max_length=255)
    content_type: str | None = Field(default=None, max_length=120)
    size_bytes: int | None = Field(default=None, ge=0)


class VehicleDocumentRead(VehicleDocumentCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    is_active: bool
    replaced_by_id: uuid.UUID | None
    verified_by_user_id: int | None
    verified_at: datetime | None
    review_notes: str | None
    created_at: datetime
    updated_at: datetime
