import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import (
    DeviceCertificationStatus,
    DeviceOperationalStatus,
    DeviceOwnershipType,
    TelemetrySourceStatus,
    TelemetrySourceType,
    TrackingAssignmentStatus,
)
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin


class TelemetrySource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "telemetry_sources"

    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    source_type: Mapped[TelemetrySourceType] = mapped_column(
        Enum(TelemetrySourceType, native_enum=False, length=30), index=True
    )
    tenant_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("tenants.id", ondelete="RESTRICT"), index=True
    )
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )
    status: Mapped[TelemetrySourceStatus] = mapped_column(
        Enum(TelemetrySourceStatus, native_enum=False, length=24),
        default=TelemetrySourceStatus.PENDING,
        index=True,
    )
    approved_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The plaintext provider API key is never persisted. The prefix is used only
    # for indexed lookup; the complete key is verified with the SHA-256 digest.
    api_key_prefix: Mapped[str | None] = mapped_column(
        String(32), unique=True, nullable=True, index=True
    )
    api_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    api_key_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    api_key_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    api_key_rotated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    api_key_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    api_key_created_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_authenticated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )


class TrackingDevice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tracking_devices"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "device_identifier", name="uq_tracking_device_source_identifier"
        ),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("telemetry_sources.id", ondelete="RESTRICT"), index=True
    )
    # Provider-side external identifier; unique only inside one telemetry source.
    device_identifier: Mapped[str] = mapped_column(String(160), index=True)
    # IMEI identifies a physical device globally. Replacing a broken device creates a new
    # device record and a new vehicle-device assignment, preserving assignment history.
    imei: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True, index=True)
    manufacturer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    protocol: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    firmware_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sim_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    data_frequency_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ownership_type: Mapped[DeviceOwnershipType] = mapped_column(
        Enum(DeviceOwnershipType, native_enum=False, length=24), index=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicle_owners.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vts_providers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    certification_status: Mapped[DeviceCertificationStatus] = mapped_column(
        Enum(DeviceCertificationStatus, native_enum=False, length=24),
        default=DeviceCertificationStatus.PENDING,
        index=True,
    )
    operational_status: Mapped[DeviceOperationalStatus] = mapped_column(
        Enum(DeviceOperationalStatus, native_enum=False, length=24),
        default=DeviceOperationalStatus.PENDING,
        index=True,
    )
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_test_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_test_payload: Mapped[dict[str, object] | None] = mapped_column(JSON, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VehicleDeviceAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_device_assignments"
    __table_args__ = (
        UniqueConstraint("vehicle_id", "device_id", "valid_from", name="uq_vehicle_device_period"),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), index=True
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("tracking_devices.id", ondelete="RESTRICT"), index=True
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("telemetry_sources.id", ondelete="RESTRICT"), index=True
    )
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vts_providers.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicle_owners.id", ondelete="RESTRICT"), index=True
    )
    account_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TrackingAssignmentStatus] = mapped_column(
        Enum(TrackingAssignmentStatus, native_enum=False, length=40), index=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    submitted_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    provider_confirmed_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    provider_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
