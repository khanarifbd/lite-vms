import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class ProviderVehicleRegistrationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_id: uuid.UUID
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
    route_permit_number: str | None = Field(default=None, max_length=120)
    route_permit_area: str | None = Field(default=None, max_length=1000)
    route_permit_expiry_date: date | None = None
    fitness_expiry_date: date | None = None
    tax_token_expiry_date: date | None = None
    insurance_expiry_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    default_speed_limit_kph: float = Field(default=80, gt=0, le=250)
    submit_for_review: bool = True


class ProviderVehicleRegistrationUpdate(BaseModel):
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
    route_permit_number: str | None = Field(default=None, max_length=120)
    route_permit_area: str | None = Field(default=None, max_length=1000)
    route_permit_expiry_date: date | None = None
    fitness_expiry_date: date | None = None
    tax_token_expiry_date: date | None = None
    insurance_expiry_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    default_speed_limit_kph: float | None = Field(default=None, gt=0, le=250)


class VehicleIdentityAvailability(BaseModel):
    available: bool
    registration_number_available: bool
    chassis_number_available: bool
    engine_number_available: bool


class CertificateGenerationRequest(BaseModel):
    vts_installation_date: date
