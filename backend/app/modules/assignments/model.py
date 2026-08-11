import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now
from app.modules.drivers.enums import DriverAssignmentStatus


class DriverAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "driver_assignments"
    __table_args__ = (
        Index(
            "uq_driver_assignments_active_driver",
            "driver_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
            sqlite_where=text("status = 'ACTIVE'"),
        ),
        Index(
            "uq_driver_assignments_on_duty_vehicle",
            "vehicle_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE' AND is_on_duty IS TRUE"),
            sqlite_where=text("status = 'ACTIVE' AND is_on_duty = 1"),
        ),
    )

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        index=True,
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("drivers.id", ondelete="RESTRICT"),
        index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="RESTRICT"),
        index=True,
    )
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[DriverAssignmentStatus] = mapped_column(
        Enum(DriverAssignmentStatus, native_enum=False, length=24),
        default=DriverAssignmentStatus.ACTIVE,
        index=True,
    )
    is_on_duty: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class DriverDutySession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "driver_duty_sessions"
    __table_args__ = (
        CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="valid_interval",
        ),
        Index(
            "uq_driver_duty_sessions_open_vehicle",
            "vehicle_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
            sqlite_where=text("ended_at IS NULL"),
        ),
        Index(
            "uq_driver_duty_sessions_open_driver",
            "driver_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
            sqlite_where=text("ended_at IS NULL"),
        ),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("driver_assignments.id", ondelete="RESTRICT"),
        index=True,
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="RESTRICT"),
        index=True,
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("drivers.id", ondelete="RESTRICT"),
        index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="RESTRICT"),
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    started_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    ended_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    start_reason: Mapped[str] = mapped_column(Text)
    end_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(40),
        default="assignment",
        server_default="assignment",
    )
