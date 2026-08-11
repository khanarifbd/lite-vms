import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.common.enums import (
    DeviceOperationalStatus,
    DocumentStatus,
    DocumentType,
    EntityStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
    VehicleReviewDecision,
    VehicleVerificationStatus,
)
from app.modules.drivers.enums import DriverAssignmentStatus, DriverLicenceStatus


class VehicleTrackingSetup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: uuid.UUID | None = None
    device_id: uuid.UUID | None = None
    device_identifier: str | None = Field(default=None, min_length=3, max_length=160)
    imei: str | None = Field(default=None, min_length=10, max_length=32)
    account_reference: str | None = Field(default=None, max_length=160)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    protocol: str | None = Field(default=None, max_length=100)
    firmware_version: str | None = Field(default=None, max_length=100)
    sim_number: str | None = Field(default=None, max_length=30)
    data_frequency_seconds: int | None = Field(default=None, ge=5, le=3600)

    @model_validator(mode="after")
    def validate_device_selection(self) -> "VehicleTrackingSetup":
        if self.device_id is None and self.device_identifier is None:
            raise ValueError("Provide device_id or device_identifier")
        if self.device_id is not None and self.device_identifier is not None:
            raise ValueError("Provide only one of device_id or device_identifier")
        if self.device_id is not None and any(
            value is not None
            for value in (
                self.imei,
                self.manufacturer,
                self.model,
                self.protocol,
                self.firmware_version,
                self.sim_number,
                self.data_frequency_seconds,
            )
        ):
            raise ValueError("Device metadata cannot be supplied with an existing device_id")
        return self


class VehicleDriverSetup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    driver_id: uuid.UUID
    valid_from: datetime | None = None
    notes: str | None = Field(default=None, max_length=1000)


class VehicleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registration_number: str = Field(min_length=3, max_length=80)
    registration_number_display: str | None = Field(default=None, max_length=80)
    chassis_number: str = Field(min_length=3, max_length=120)
    engine_number: str | None = Field(default=None, max_length=120)
    vehicle_type: str = Field(min_length=2, max_length=60)
    vehicle_category: str | None = Field(default=None, max_length=80)
    usage_type: str | None = Field(default=None, max_length=40)
    body_type: str | None = Field(default=None, max_length=80)
    fuel_type: str | None = Field(default=None, max_length=40)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    manufacturing_year: int | None = Field(default=None, ge=1900, le=2200)
    registration_date: date | None = None
    registration_authority: str | None = Field(default=None, max_length=120)
    engine_capacity_cc: int | None = Field(default=None, ge=1, le=100000)
    axle_count: int | None = Field(default=None, ge=1, le=30)
    gross_vehicle_weight_kg: float | None = Field(default=None, ge=0, le=1_000_000)
    color: str | None = Field(default=None, max_length=60)
    seating_capacity: int | None = Field(default=None, ge=1, le=500)
    load_capacity_kg: float | None = Field(default=None, ge=0, le=500000)
    vehicle_photo_storage_key: str | None = Field(default=None, max_length=500)
    front_photo_storage_key: str | None = Field(default=None, max_length=500)
    back_photo_storage_key: str | None = Field(default=None, max_length=500)
    registration_certificate_storage_key: str | None = Field(default=None, max_length=500)
    fitness_expiry_date: date | None = None
    tax_token_expiry_date: date | None = None
    insurance_expiry_date: date | None = None
    route_permit_number: str | None = Field(default=None, max_length=120)
    route_permit_area: str | None = Field(default=None, max_length=1000)
    route_permit_expiry_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    owner_id: uuid.UUID | None = None
    default_speed_limit_kph: float = Field(default=80, gt=0, le=250)
    tracking_setup: VehicleTrackingSetup | None = None
    current_driver: VehicleDriverSetup | None = None


class VehicleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    registration_number: str | None = Field(default=None, min_length=3, max_length=80)
    registration_number_display: str | None = Field(default=None, max_length=80)
    chassis_number: str | None = Field(default=None, min_length=3, max_length=120)
    engine_number: str | None = Field(default=None, max_length=120)
    vehicle_type: str | None = Field(default=None, min_length=2, max_length=60)
    vehicle_category: str | None = Field(default=None, max_length=80)
    usage_type: str | None = Field(default=None, max_length=40)
    body_type: str | None = Field(default=None, max_length=80)
    fuel_type: str | None = Field(default=None, max_length=40)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    manufacturing_year: int | None = Field(default=None, ge=1900, le=2200)
    registration_date: date | None = None
    registration_authority: str | None = Field(default=None, max_length=120)
    engine_capacity_cc: int | None = Field(default=None, ge=1, le=100000)
    axle_count: int | None = Field(default=None, ge=1, le=30)
    gross_vehicle_weight_kg: float | None = Field(default=None, ge=0, le=1_000_000)
    color: str | None = Field(default=None, max_length=60)
    seating_capacity: int | None = Field(default=None, ge=1, le=500)
    load_capacity_kg: float | None = Field(default=None, ge=0, le=500000)
    vehicle_photo_storage_key: str | None = Field(default=None, max_length=500)
    front_photo_storage_key: str | None = Field(default=None, max_length=500)
    back_photo_storage_key: str | None = Field(default=None, max_length=500)
    registration_certificate_storage_key: str | None = Field(default=None, max_length=500)
    fitness_expiry_date: date | None = None
    tax_token_expiry_date: date | None = None
    insurance_expiry_date: date | None = None
    route_permit_number: str | None = Field(default=None, max_length=120)
    route_permit_area: str | None = Field(default=None, max_length=1000)
    route_permit_expiry_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    default_speed_limit_kph: float | None = Field(default=None, gt=0, le=250)


class VehicleReview(BaseModel):
    decision: VehicleReviewDecision
    notes: str = Field(min_length=3, max_length=1000)


class VehicleOwnerSummary(BaseModel):
    id: uuid.UUID
    owner_code: str | None
    owner_name: str
    phone: str | None
    email: str | None


class VehicleDocumentSummary(BaseModel):
    id: uuid.UUID
    document_type: DocumentType
    document_number: str | None
    issued_at: date | None
    expires_at: date | None
    status: DocumentStatus
    storage_key: str | None
    file_name: str | None
    version: int
    is_active: bool
    review_notes: str | None = None


class VehicleRead(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    chassis_number: str
    engine_number: str | None
    vehicle_type: str
    vehicle_category: str | None
    usage_type: str | None
    body_type: str | None
    fuel_type: str | None
    brand: str | None
    model: str | None
    manufacturing_year: int | None
    registration_date: date | None
    registration_authority: str | None
    engine_capacity_cc: int | None
    axle_count: int | None
    gross_vehicle_weight_kg: float | None
    color: str | None
    seating_capacity: int | None
    load_capacity_kg: float | None
    vehicle_photo_storage_key: str | None
    front_photo_storage_key: str | None
    back_photo_storage_key: str | None
    registration_certificate_storage_key: str | None
    fitness_expiry_date: date | None
    tax_token_expiry_date: date | None
    insurance_expiry_date: date | None
    route_permit_number: str | None
    route_permit_area: str | None
    route_permit_expiry_date: date | None
    vts_installation_date: date | None
    notes: str | None
    owner_id: uuid.UUID
    owner: VehicleOwnerSummary
    created_by_provider_id: uuid.UUID | None
    created_by_provider_name: str | None
    default_speed_limit_kph: float
    latest_latitude: float | None
    latest_longitude: float | None
    latest_speed_kph: float | None
    last_recorded_at: datetime | None
    gps_online: bool = False
    tracking_last_seen_at: datetime | None = None
    latest_heading: float | None = None
    latest_ignition: bool | None = None
    verification_status: VehicleVerificationStatus
    review_notes: str | None
    status: EntityStatus
    documents: list[VehicleDocumentSummary] = Field(default_factory=list)
    fitness_status: DocumentStatus | None = None
    tax_token_status: DocumentStatus | None = None
    insurance_status: DocumentStatus | None = None
    route_permit_status: DocumentStatus | None = None
    active_assignment_id: uuid.UUID | None = None
    tracking_assignment_id: uuid.UUID | None = None
    tracking_assignment_status: TrackingAssignmentStatus | None = None
    tracking_source_type: TelemetrySourceType | None = None
    tracking_source_code: str | None = None
    tracking_provider_id: uuid.UUID | None = None
    tracking_provider_name: str | None = None
    tracking_device_id: uuid.UUID | None = None
    tracking_device_identifier: str | None = None
    tracking_device_operational_status: DeviceOperationalStatus | None = None
    current_driver_assignment_id: uuid.UUID | None = None
    current_driver_assignment_status: DriverAssignmentStatus | None = None
    current_driver_id: uuid.UUID | None = None
    current_driver_name: str | None = None
    current_driver_mobile: str | None = None
    current_driver_licence_number: str | None = None
    current_driver_licence_status: DriverLicenceStatus | None = None
    current_driver_licence_expiry: date | None = None
    qr_token: str | None = None
    created_at: datetime
    updated_at: datetime


class VehiclePage(BaseModel):
    items: list[VehicleRead]
    total: int
    offset: int
    limit: int
