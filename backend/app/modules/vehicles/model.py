import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import EntityStatus, VehicleVerificationStatus
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin


class Vehicle(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicles"

    registration_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    registration_number_display: Mapped[str | None] = mapped_column(String(80), nullable=True)
    chassis_number: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    engine_number: Mapped[str | None] = mapped_column(
        String(120), nullable=True, unique=True, index=True
    )
    vehicle_type: Mapped[str] = mapped_column(String(60), index=True)
    vehicle_category: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    usage_type: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    body_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    fuel_type: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manufacturing_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    registration_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    registration_authority: Mapped[str | None] = mapped_column(String(120), nullable=True)
    engine_capacity_cc: Mapped[int | None] = mapped_column(Integer, nullable=True)
    axle_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gross_vehicle_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    color: Mapped[str | None] = mapped_column(String(60), nullable=True)
    seating_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    load_capacity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    vehicle_photo_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    front_photo_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    back_photo_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    registration_certificate_storage_key: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    fitness_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    tax_token_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    insurance_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    route_permit_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    route_permit_area: Mapped[str | None] = mapped_column(Text, nullable=True)
    route_permit_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicle_owners.id", ondelete="RESTRICT"), index=True
    )
    created_by_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    submitted_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[VehicleVerificationStatus] = mapped_column(
        Enum(VehicleVerificationStatus, native_enum=False, length=32),
        default=VehicleVerificationStatus.PENDING_VERIFICATION,
        index=True,
    )
    default_speed_limit_kph: Mapped[float] = mapped_column(Float, default=80.0)
    latest_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_speed_kph: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    latest_ignition: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # The latest packet-derived operational state. Offline and no_data remain API-derived
    # because they can change with the passage of time even when no packet is received.
    movement_state: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    movement_state_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Device-provided time is preserved separately and is never authoritative for
    # deciding which packet owns the current vehicle state.
    last_recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Server receive time is the authoritative ordering key for latest status.
    last_received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus, native_enum=False, length=20),
        default=EntityStatus.ACTIVE,
        index=True,
    )
