import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now


class TelemetryPoint(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "telemetry_points"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "external_event_id", name="uq_telemetry_source_external_event"
        ),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        index=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("telemetry_sources.id", ondelete="RESTRICT"),
        index=True,
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("tracking_devices.id", ondelete="RESTRICT"),
        index=True,
    )
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_device_assignments.id", ondelete="RESTRICT"),
        index=True,
    )
    external_event_id: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
        index=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    speed_kph: Mapped[float] = mapped_column(Float, default=0)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    ignition: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    gps_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    enforcement_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("speed_rules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    enforcement_threshold_kph: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
