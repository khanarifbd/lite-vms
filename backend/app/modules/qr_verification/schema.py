import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.common.enums import DocumentStatus, DocumentType


class QRDriverSummary(BaseModel):
    id: uuid.UUID
    name: str
    licence_number: str
    licence_expiry: date | None
    behaviour_score: float


class QRDocumentSummary(BaseModel):
    document_type: DocumentType
    document_number: str | None
    expires_at: date | None
    status: DocumentStatus


class QRVehicleVerification(BaseModel):
    vehicle_id: uuid.UUID
    registration_number: str
    vehicle_type: str
    owner_name: str
    provider_name: str
    gps_online: bool
    last_recorded_at: datetime | None
    latest_latitude: float | None
    latest_longitude: float | None
    current_driver: QRDriverSummary | None
    documents: list[QRDocumentSummary]


class VehicleQRCard(BaseModel):
    vehicle_id: uuid.UUID
    registration_number: str
    vehicle_type: str
    token: str
    verification_path: str
    qr_svg: str
    issued_at: datetime


class PublicQRDriverSummary(BaseModel):
    name: str
    driver_code: str
    verification_status: str
    assignment_status: str
    is_on_duty: bool
    behaviour_score: float
    licence_status: str | None
    licence_expiry: date | None


class PublicQRDocumentSummary(BaseModel):
    document_type: str
    status: str
    expires_at: date | None


class PublicVehicleQRVerification(BaseModel):
    valid: bool = True
    vehicle_id: uuid.UUID
    qr_issued_at: datetime
    registration_number: str
    vehicle_type: str
    vehicle_category: str | None
    usage_type: str | None
    body_type: str | None
    fuel_type: str | None
    brand: str | None
    model: str | None
    color: str | None
    manufacturing_year: int | None
    verification_status: str
    vehicle_status: str
    owner_name: str
    provider_name: str
    gps_online: bool
    last_signal_at: datetime | None
    current_speed_kph: float
    current_driver: PublicQRDriverSummary | None
    documents: list[PublicQRDocumentSummary]


class PublicCertificateVerification(BaseModel):
    valid: bool
    certificate_number: str
    issued_at: date | None
    expires_at: date | None
    vts_installation_date: date | None
    owner_name: str
    registration_number: str
    vehicle_type: str
    chassis_number: str
