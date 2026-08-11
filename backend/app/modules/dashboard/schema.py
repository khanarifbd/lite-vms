import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class DashboardTotals(BaseModel):
    users: int
    active_users: int
    providers: int
    approved_providers: int
    owners: int
    vehicles: int


class DashboardPending(BaseModel):
    providers: int
    owners: int
    vehicles: int


class RecentUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: uuid.UUID
    display_name: str
    status: str
    primary_identifier: str | None = None
    primary_role: str | None = None
    created_at: datetime


class RecentProviderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    application_number: str | None = None
    code: str
    legal_name: str
    district: str | None = None
    status: str
    submitted_at: datetime | None = None


class SuperAdminDashboardSummary(BaseModel):
    totals: DashboardTotals
    pending: DashboardPending
    recent_users: list[RecentUserSummary]
    recent_providers: list[RecentProviderSummary]


class OwnerDashboardOwnerSummary(BaseModel):
    id: uuid.UUID
    owner_code: str | None = None
    owner_name: str
    verification_status: str
    review_notes: str | None = None


class OwnerDashboardStats(BaseModel):
    vehicles: int
    verified_vehicles: int
    pending_vehicles: int
    vehicles_needing_attention: int
    online_vehicles: int
    offline_vehicles: int
    active_tracking_vehicles: int
    active_providers: int
    pending_provider_requests: int
    expiring_documents: int
    expired_documents: int


class OwnerDashboardVehicleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None = None
    brand: str | None = None
    model: str | None = None
    vehicle_type: str
    verification_status: str
    gps_online: bool
    active_tracking: bool
    tracking_last_seen_at: datetime | None = None
    document_attention_count: int


class OwnerDashboardDocumentAlert(BaseModel):
    vehicle_id: uuid.UUID
    registration_number: str
    document_type: str
    expiry_date: date
    days_remaining: int
    status: str


class OwnerDashboardAction(BaseModel):
    key: str
    title: str
    description: str
    href: str
    severity: str
    count: int = 0


class OwnerDashboardSummary(BaseModel):
    owner: OwnerDashboardOwnerSummary
    stats: OwnerDashboardStats
    actions: list[OwnerDashboardAction]
    document_alerts: list[OwnerDashboardDocumentAlert]
    recent_vehicles: list[OwnerDashboardVehicleSummary]
