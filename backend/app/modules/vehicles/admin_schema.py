import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.common.enums import VehicleReviewDecision
from app.modules.vehicles.schema import VehicleRead


class AdminVehicleReview(BaseModel):
    decision: VehicleReviewDecision
    notes: str = Field(min_length=3, max_length=2000)


class AdminVehicleAuditEvent(BaseModel):
    id: uuid.UUID
    action: str
    actor_name: str | None = None
    reason: str | None = None
    created_at: datetime


class AdminVehicleQRStatus(BaseModel):
    id: uuid.UUID | None = None
    token: str | None = None
    is_active: bool = False
    issued_at: datetime | None = None


class AdminVehicleDetail(BaseModel):
    vehicle: VehicleRead
    qr: AdminVehicleQRStatus
    review_history: list[AdminVehicleAuditEvent]
