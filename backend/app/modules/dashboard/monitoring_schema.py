import uuid
from datetime import datetime

from pydantic import BaseModel


class MonitoringStats(BaseModel):
    tracked_vehicles: int
    online_vehicles: int
    offline_vehicles: int
    moving_vehicles: int
    idle_vehicles: int
    stopped_vehicles: int
    no_data_vehicles: int
    active_providers: int
    unhealthy_providers: int
    expired_documents: int
    pending_violations: int
    overspeed_alerts: int
    geofence_alerts: int
    route_alerts: int


class MonitoringVehicle(BaseModel):
    id: uuid.UUID
    registration_number: str
    registration_number_display: str | None
    owner_name: str
    provider_name: str | None
    latitude: float | None
    longitude: float | None
    speed_kph: float | None
    last_known_speed_kph: float | None = None
    heading: float | None
    ignition: bool | None
    recorded_at: datetime | None
    received_at: datetime | None
    online: bool
    movement_state: str
    movement_state_changed_at: datetime | None
    state_duration_seconds: int
    current_driver_id: uuid.UUID | None = None
    current_driver_name: str | None = None
    current_driver_on_duty: bool | None = None


class ProviderHealthItem(BaseModel):
    provider_id: uuid.UUID
    provider_code: str
    provider_name: str
    source_status: str | None
    tracked_vehicles: int
    online_vehicles: int
    offline_vehicles: int
    last_seen_at: datetime | None
    health: str


class MonitoringAlert(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    registration_number: str
    violation_type: str
    status: str
    detected_value: float | None
    allowed_value: float | None
    latitude: float
    longitude: float
    detected_at: datetime


class NationalMonitoringDashboard(BaseModel):
    generated_at: datetime
    stats: MonitoringStats
    vehicles: list[MonitoringVehicle]
    provider_health: list[ProviderHealthItem]
    alerts: list[MonitoringAlert]
