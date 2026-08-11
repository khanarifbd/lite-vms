import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import (
    EnforcementAreaType,
    EnforcementScope,
    EnforcementSeverity,
    ExemptionReason,
    ViolationType,
)
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin


class EnforcementPolicy(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "enforcement_policies"

    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    violation_type: Mapped[ViolationType] = mapped_column(
        Enum(ViolationType, native_enum=False, length=40), index=True
    )
    scope: Mapped[EnforcementScope] = mapped_column(
        Enum(EnforcementScope, native_enum=False, length=30),
        default=EnforcementScope.NATIONAL,
        index=True,
    )
    severity: Mapped[EnforcementSeverity] = mapped_column(
        Enum(EnforcementSeverity, native_enum=False, length=20),
        default=EnforcementSeverity.MEDIUM,
        index=True,
    )
    minimum_duration_seconds: Mapped[int] = mapped_column(Integer, default=10)
    minimum_consecutive_packets: Mapped[int] = mapped_column(Integer, default=3)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=300)
    acceptable_packet_delay_seconds: Mapped[int] = mapped_column(Integer, default=120)
    review_required: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_create_candidate: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_create_case: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legal_reference: Mapped[str | None] = mapped_column(String(240), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class EnforcementGeofence(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "enforcement_geofences"

    name: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    geometry: Mapped[dict] = mapped_column(JSON)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class EnforcementJurisdiction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Legacy area mapping retained only so existing test data can migrate safely."""

    __tablename__ = "enforcement_jurisdictions"

    organization_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(180))
    area_type: Mapped[EnforcementAreaType] = mapped_column(
        Enum(EnforcementAreaType, native_enum=False, length=30), index=True
    )
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class SpeedRule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Rule binding a reusable policy, area and responsible police organization."""

    __tablename__ = "speed_rules"

    name: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    policy_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("enforcement_policies.id", ondelete="RESTRICT"), index=True
    )
    geofence_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("enforcement_geofences.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    jurisdiction_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("enforcement_jurisdictions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    review_organization_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    area_type: Mapped[EnforcementAreaType] = mapped_column(
        Enum(EnforcementAreaType, native_enum=False, length=30), index=True
    )
    geometry: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    maximum_speed_kph: Mapped[float] = mapped_column(Float)
    tolerance_kph: Mapped[float] = mapped_column(Float, default=5.0)
    vehicle_scope: Mapped[str] = mapped_column(String(30), default="all", index=True)
    vehicle_ids: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    vehicle_categories: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    active_days: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    active_start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    active_end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=100, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EnforcementCase(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "enforcement_cases"
    __table_args__ = (
        Index("ix_enforcement_cases_opened_id", "opened_at", "id"),
        Index("ix_enforcement_cases_status_opened_id", "status", "opened_at", "id"),
    )

    case_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("violation_candidates.id", ondelete="RESTRICT"), unique=True, index=True
    )
    organization_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("organizations.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    opened_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class VehicleEnforcementExemption(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_enforcement_exemptions"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), index=True
    )
    violation_type: Mapped[ViolationType | None] = mapped_column(
        Enum(ViolationType, native_enum=False, length=40), nullable=True, index=True
    )
    reason: Mapped[ExemptionReason] = mapped_column(
        Enum(ExemptionReason, native_enum=False, length=40), index=True
    )
    reference_number: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )