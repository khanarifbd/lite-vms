import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Index, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import ViolationStatus, ViolationType
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin


class ViolationCandidate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "violation_candidates"
    __table_args__ = (
        Index(
            "ix_violation_candidates_status_detected_id",
            "status",
            "detected_at",
            "id",
        ),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        index=True,
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("drivers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    telemetry_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("telemetry_points.id", ondelete="CASCADE"),
        unique=True,
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("speed_rules.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    policy_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("enforcement_policies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    review_organization_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    violation_type: Mapped[ViolationType] = mapped_column(
        Enum(ViolationType, native_enum=False, length=40),
        index=True,
    )
    status: Mapped[ViolationStatus] = mapped_column(
        Enum(ViolationStatus, native_enum=False, length=40),
        default=ViolationStatus.PENDING_REVIEW,
        index=True,
    )
    detected_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    allowed_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    assigned_officer_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    case_number: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
