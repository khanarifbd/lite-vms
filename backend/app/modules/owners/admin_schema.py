from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import UserStatus
from app.modules.audit.schema import AuditHistoryEntry
from app.modules.owners.schema import OwnerApplicationRead


class AdminOwnerVehicleSummary(BaseModel):
    id: str
    registration_number: str
    registration_number_display: str | None
    vehicle_type: str
    brand: str | None
    model: str | None
    verification_status: str
    status: str
    latest_speed_kph: float | None
    last_recorded_at: str | None


class AdminOwnerDetail(BaseModel):
    owner: OwnerApplicationRead
    vehicles: list[AdminOwnerVehicleSummary]
    account_status: UserStatus | None = None
    last_administrative_reason: str | None = None
    history: list[AuditHistoryEntry] = Field(default_factory=list)


class AdminOwnerStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: Literal["activate", "lock", "suspend", "reactivate"]
    reason: str = Field(min_length=3, max_length=2000)


class AdminOwnerStatusResult(BaseModel):
    owner: OwnerApplicationRead
    message: str
