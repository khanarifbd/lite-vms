import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.common.enums import (
    EnforcementAreaType,
    EnforcementScope,
    EnforcementSeverity,
    ExemptionReason,
    ViolationStatus,
    ViolationType,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EnforcementPolicyCreate(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    violation_type: ViolationType
    scope: EnforcementScope = EnforcementScope.NATIONAL
    severity: EnforcementSeverity = EnforcementSeverity.MEDIUM
    minimum_duration_seconds: int = Field(default=10, ge=0, le=3600)
    minimum_consecutive_packets: int = Field(default=3, ge=1, le=100)
    cooldown_seconds: int = Field(default=300, ge=0, le=86400)
    acceptable_packet_delay_seconds: int = Field(default=120, ge=0, le=3600)
    review_required: bool = True
    auto_create_candidate: bool = True
    auto_create_case: bool = False
    enabled: bool = True
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    legal_reference: str | None = Field(default=None, max_length=240)
    notes: str | None = None

    @model_validator(mode="after")
    def validate_dates_and_case_mode(self):
        if self.effective_from and self.effective_to and self.effective_to <= self.effective_from:
            raise ValueError("effective_to must be later than effective_from")
        if self.auto_create_case and self.review_required:
            raise ValueError("auto_create_case cannot be enabled while review_required is true")
        return self


class EnforcementPolicyUpdate(EnforcementPolicyCreate):
    change_note: str = Field(min_length=3, max_length=1000)


class EnforcementPolicyRead(ORMModel, EnforcementPolicyCreate):
    id: uuid.UUID
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class EnforcementPolicyHistoryRead(ORMModel):
    id: int
    actor_user_id: int | None
    action: str
    previous_values: dict | None
    new_values: dict | None
    reason: str | None
    created_at: datetime


class PoliceOrganizationRead(BaseModel):
    id: int
    public_id: uuid.UUID
    name_en: str
    name_bn: str | None
    organization_type: str


class GeofenceCreate(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    description: str | None = None
    geometry: dict
    enabled: bool = True

    @model_validator(mode="after")
    def validate_geometry(self):
        geometry_type = self.geometry.get("type") if isinstance(self.geometry, dict) else None
        if geometry_type not in {"Polygon", "MultiPolygon", "Circle"}:
            raise ValueError("Geofence geometry type must be Polygon, MultiPolygon, or Circle")
        return self


class GeofenceUpdate(GeofenceCreate):
    change_note: str = Field(min_length=3, max_length=1000)


class GeofenceRead(ORMModel, GeofenceCreate):
    id: uuid.UUID
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class JurisdictionCreate(BaseModel):
    organization_id: int
    name: str = Field(min_length=3, max_length=180)
    area_type: EnforcementAreaType
    geometry: dict | None = None
    priority: int = Field(default=100, ge=0, le=10000)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_geometry(self):
        if self.area_type == EnforcementAreaType.NATIONAL and self.geometry is not None:
            raise ValueError("National jurisdiction must not define geometry")
        if self.area_type != EnforcementAreaType.NATIONAL and self.geometry is None:
            raise ValueError("Geometry is required for non-national jurisdiction")
        return self


class JurisdictionRead(ORMModel, JurisdictionCreate):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SpeedRuleCreate(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    policy_id: uuid.UUID
    geofence_id: uuid.UUID | None = None
    jurisdiction_id: uuid.UUID | None = None
    review_organization_id: int
    area_type: EnforcementAreaType = EnforcementAreaType.NATIONAL
    geometry: dict | None = None
    maximum_speed_kph: float = Field(gt=0, le=300)
    tolerance_kph: float = Field(default=5, ge=0, le=50)
    vehicle_scope: Literal["all", "exclude_selected", "include_selected"] = "all"
    vehicle_ids: list[uuid.UUID] | None = None
    vehicle_categories: list[str] | None = None
    active_days: list[int] | None = None
    active_start_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    active_end_time: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    priority: int = Field(default=100, ge=0, le=10000)
    enabled: bool = True
    effective_from: datetime | None = None
    effective_to: datetime | None = None

    @model_validator(mode="after")
    def validate_rule(self):
        is_national = self.area_type == EnforcementAreaType.NATIONAL
        if is_national and self.geofence_id is not None:
            raise ValueError("National rule must not select a geofence")
        if not is_national and self.geofence_id is None:
            raise ValueError("A specific-area rule must select a geofence")
        if self.active_days and any(day < 0 or day > 6 for day in self.active_days):
            raise ValueError("active_days values must be between 0 and 6")
        if bool(self.active_start_time) != bool(self.active_end_time):
            raise ValueError("active_start_time and active_end_time must be provided together")
        if self.effective_from and self.effective_to and self.effective_to <= self.effective_from:
            raise ValueError("effective_to must be later than effective_from")
        if self.vehicle_scope == "all" and self.vehicle_ids:
            raise ValueError("vehicle_ids must be empty when vehicle_scope is all")
        if self.vehicle_scope != "all" and not self.vehicle_ids:
            raise ValueError("Select at least one vehicle for the chosen vehicle scope")
        if self.vehicle_ids and len(set(self.vehicle_ids)) != len(self.vehicle_ids):
            raise ValueError("vehicle_ids must not contain duplicates")
        return self


class SpeedRuleUpdate(SpeedRuleCreate):
    change_note: str = Field(min_length=3, max_length=1000)


class SpeedRuleRead(ORMModel):
    """Read model intentionally tolerates legacy rows.

    New create/update requests still use SpeedRuleCreate/SpeedRuleUpdate and must
    provide a police organization plus a geofence for specific-area rules.
    """

    id: uuid.UUID
    name: str
    policy_id: uuid.UUID
    geofence_id: uuid.UUID | None
    jurisdiction_id: uuid.UUID | None
    review_organization_id: int | None
    area_type: EnforcementAreaType
    geometry: dict | None
    maximum_speed_kph: float
    tolerance_kph: float
    vehicle_scope: str
    vehicle_ids: list[uuid.UUID] | None
    vehicle_categories: list[str] | None
    active_days: list[int] | None
    active_start_time: str | None
    active_end_time: str | None
    priority: int
    enabled: bool
    effective_from: datetime | None
    effective_to: datetime | None
    created_at: datetime
    updated_at: datetime


class ViolationCandidateRead(ORMModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None
    telemetry_id: uuid.UUID
    rule_id: uuid.UUID | None
    policy_id: uuid.UUID | None
    review_organization_id: int | None
    violation_type: ViolationType
    status: ViolationStatus
    detected_value: float | None
    allowed_value: float | None
    latitude: float
    longitude: float
    detected_at: datetime
    evidence: dict | None
    assigned_officer_id: str | None
    reviewed_by: str | None
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    review_note: str | None
    case_number: str | None
    created_at: datetime
    updated_at: datetime


class CandidateDecision(BaseModel):
    decision: Literal["approve", "reject"]
    review_note: str = Field(min_length=3, max_length=2000)


class EnforcementCaseRead(ORMModel):
    id: uuid.UUID
    case_number: str
    candidate_id: uuid.UUID
    organization_id: int
    status: str
    opened_by_user_id: int | None
    opened_at: datetime
    closed_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class VehicleExemptionCreate(BaseModel):
    vehicle_id: uuid.UUID
    violation_type: ViolationType | None = None
    reason: ExemptionReason
    reference_number: str | None = Field(default=None, max_length=120)
    valid_from: datetime
    valid_to: datetime | None = None
    enabled: bool = True
    note: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.valid_to and self.valid_to <= self.valid_from:
            raise ValueError("valid_to must be later than valid_from")
        return self


class VehicleExemptionRead(ORMModel, VehicleExemptionCreate):
    id: uuid.UUID
    approved_by_user_id: int | None
    created_at: datetime
    updated_at: datetime
