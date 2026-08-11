import uuid
from datetime import datetime

from pydantic import BaseModel


class AdminCommandStats(BaseModel):
    providers_total: int
    providers_approved: int
    providers_pending: int
    owners_total: int
    owners_pending: int
    vehicles_total: int
    vehicles_verified: int
    vehicles_pending: int
    drivers_total: int
    drivers_verified: int
    drivers_pending: int
    driver_licences_expiring: int
    driver_licences_expired: int

    # Vehicle compliance documents. Counts are distinct vehicles with one active
    # document of the corresponding type in the expiry window.
    registration_documents_expiring: int
    registration_documents_expired: int
    fitness_documents_expiring: int
    fitness_documents_expired: int
    tax_tokens_expiring: int
    tax_tokens_expired: int
    insurance_documents_expiring: int
    insurance_documents_expired: int
    route_permits_expiring: int
    route_permits_expired: int
    vehicles_with_expiring_documents: int
    vehicles_with_expired_documents: int

    gps_online: int
    gps_offline: int
    active_tracking: int
    pending_document_reviews: int
    changes_requested: int
    rejected_records: int


class AdminCommandAlert(BaseModel):
    key: str
    title: str
    description: str
    severity: str
    count: int
    href: str


class AdminRecentActivity(BaseModel):
    id: uuid.UUID
    action: str
    resource_type: str
    resource_public_id: uuid.UUID | None = None
    actor_name: str | None = None
    reason: str | None = None
    created_at: datetime


class AdminCommandDashboard(BaseModel):
    stats: AdminCommandStats
    alerts: list[AdminCommandAlert]
    recent_activity: list[AdminRecentActivity]
