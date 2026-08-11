import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.common.enums import ProviderStatus, TrackingAssignmentStatus, VehicleVerificationStatus
from app.modules.owners.enums import (
    OwnerProviderLinkDecision,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
    OwnerProviderVehicleScopeMode,
)


class OwnerProviderDirectoryItem(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    trade_name: str | None
    district: str | None
    website_url: str | None
    support_phone: str | None
    support_email: str | None
    service_coverage: list[str]
    integration_status: str | None
    status: ProviderStatus
    current_link_status: OwnerProviderLinkStatus | None = None


class OwnerConnectionVehicleRead(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    brand: str | None
    model: str | None
    vehicle_type: str
    verification_status: VehicleVerificationStatus
    tracking_provider_id: uuid.UUID | None
    tracking_provider_name: str | None
    tracking_assignment_status: TrackingAssignmentStatus | None


class OwnerProviderConnectionRead(BaseModel):
    id: uuid.UUID
    provider_id: uuid.UUID
    provider_code: str
    provider_name: str
    provider_trade_name: str | None
    provider_district: str | None
    provider_support_phone: str | None
    provider_support_email: str | None
    status: OwnerProviderLinkStatus
    requested_by: OwnerProviderRequestSource
    requested_at: datetime
    responded_at: datetime | None
    ended_at: datetime | None
    reason: str | None
    vehicle_scope_mode: OwnerProviderVehicleScopeMode
    selected_vehicle_ids: list[uuid.UUID]
    managed_vehicle_count: int
    created_vehicle_count: int
    active_tracking_count: int
    created_at: datetime
    updated_at: datetime


class OwnerProviderConnectionStats(BaseModel):
    total_links: int
    active: int
    pending_owner_approval: int
    pending_provider_approval: int
    ended_or_rejected: int
    approved_providers: int


class OwnerProviderConnectionWorkspace(BaseModel):
    stats: OwnerProviderConnectionStats
    providers: list[OwnerProviderDirectoryItem]
    connections: list[OwnerProviderConnectionRead]
    vehicles: list[OwnerConnectionVehicleRead]


class OwnerProviderConnectionRequest(BaseModel):
    provider_id: uuid.UUID
    notes: str | None = Field(default=None, max_length=1000)


class OwnerProviderConnectionDecision(BaseModel):
    decision: OwnerProviderLinkDecision
    notes: str | None = Field(default=None, max_length=1000)


class OwnerProviderConnectionEnd(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class OwnerProviderVehicleScopeUpdate(BaseModel):
    scope_mode: OwnerProviderVehicleScopeMode
    vehicle_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    reason: str | None = Field(default=None, max_length=1000)
