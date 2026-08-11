import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.config import settings


PacketOperation = Literal["loc", "noloc"]


class TrackingPacket(BaseModel):
    registration_number: str = Field(min_length=2, max_length=80)
    imei: str = Field(min_length=5, max_length=32)
    op: PacketOperation

    dt_tracker: datetime
    dt_provider_received: datetime

    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    speed: float | None = Field(default=None, ge=0, le=400)
    angle: float | None = Field(default=None, ge=0, lt=360)
    altitude: float | None = None
    loc_valid: bool | None = None

    params: dict[str, Any] = Field(default_factory=dict)
    protocol: str | None = Field(default=None, max_length=50)
    net_protocol: Literal["tcp", "udp", "http", "https"] | None = None
    ip: str | None = Field(default=None, max_length=64)
    port: int | None = Field(default=None, ge=1, le=65535)
    event: str | None = Field(default=None, max_length=100)

    @field_validator("dt_tracker", "dt_provider_received")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("datetime must include a timezone offset")
        return value

    @model_validator(mode="after")
    def validate_packet_shape(self) -> "TrackingPacket":
        if self.op == "loc":
            if self.lat is None or self.lng is None:
                raise ValueError("lat and lng are required for loc packets")
            if self.loc_valid is None:
                raise ValueError("loc_valid is required for loc packets")
        return self


class TrackingBatchIn(BaseModel):
    packets: list[TrackingPacket] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_batch_limit(self) -> "TrackingBatchIn":
        if len(self.packets) > settings.telemetry_max_batch_size:
            raise ValueError(
                f"A request may contain at most {settings.telemetry_max_batch_size} packets"
            )
        return self


class RejectedPacket(BaseModel):
    index: int
    code: str
    message: str


class TrackingBatchAck(BaseModel):
    status: Literal["accepted", "partially_accepted", "rejected"]
    request_id: uuid.UUID
    batch_id: uuid.UUID
    received: int
    accepted: int
    rejected: int
    rejected_items: list[RejectedPacket] = Field(default_factory=list)
    received_at: datetime
