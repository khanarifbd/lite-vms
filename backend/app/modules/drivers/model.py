import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
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

from app.common.enums import EntityStatus
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now
from app.modules.drivers.enums import (
    DriverClaimStatus,
    DriverDocumentStatus,
    DriverDocumentType,
    DriverLicenceStatus,
    DriverLicenceType,
    DriverLinkSource,
    DriverLinkStatus,
    DriverProfileChangeStatus,
    DriverVerificationStatus,
)


class Driver(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "drivers"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="RESTRICT"), unique=True, index=True
    )
    driver_code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    nid_reference: Mapped[str | None] = mapped_column(
        String(120), unique=True, index=True, nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(180), index=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(30), nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    phone: Mapped[str] = mapped_column(String(30), index=True)
    email: Mapped[str] = mapped_column(String(180), index=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    present_address: Mapped[str] = mapped_column(Text)
    permanent_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    district: Mapped[str] = mapped_column(String(100), index=True)
    photo_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    employment_type: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    shift_information: Mapped[str | None] = mapped_column(Text, nullable=True)
    medical_fitness_expiry_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        index=True,
    )
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    claim_status: Mapped[DriverClaimStatus] = mapped_column(
        Enum(DriverClaimStatus, native_enum=False, length=24),
        default=DriverClaimStatus.CLAIMED,
        index=True,
    )
    verification_status: Mapped[DriverVerificationStatus] = mapped_column(
        Enum(DriverVerificationStatus, native_enum=False, length=32),
        default=DriverVerificationStatus.PENDING,
        index=True,
    )
    behaviour_score: Mapped[float] = mapped_column(Float, default=100.0)
    declaration_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    reviewed_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_change_status: Mapped[DriverProfileChangeStatus | None] = mapped_column(
        Enum(DriverProfileChangeStatus, native_enum=False, length=32),
        nullable=True,
        index=True,
    )
    pending_profile_changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    profile_change_submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    profile_change_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    profile_change_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,

    )
    created_by_owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="SET NULL"),
        nullable=True,
        index=True,

    )
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus, native_enum=False, length=20), default=EntityStatus.ACTIVE, index=True
    )


class DriverLicence(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "driver_licences"

    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE"), unique=True, index=True
    )
    licence_number: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    licence_type: Mapped[DriverLicenceType] = mapped_column(
        Enum(DriverLicenceType, native_enum=False, length=30), index=True
    )
    vehicle_classes: Mapped[list[str]] = mapped_column(JSON, default=list)
    first_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date] = mapped_column(Date, index=True)
    issuing_authority: Mapped[str] = mapped_column(String(80), default="BRTA")
    verification_status: Mapped[DriverLicenceStatus] = mapped_column(
        Enum(DriverLicenceStatus, native_enum=False, length=24),
        default=DriverLicenceStatus.PENDING,
        index=True,
    )
    verified_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class DriverDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "driver_documents"

    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE"), index=True
    )
    document_type: Mapped[DriverDocumentType] = mapped_column(
        Enum(DriverDocumentType, native_enum=False, length=40), index=True
    )
    document_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("driver_documents.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[DriverDocumentStatus] = mapped_column(
        Enum(DriverDocumentStatus, native_enum=False, length=20),
        default=DriverDocumentStatus.PENDING,
        index=True,
    )
    verified_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class VTSProviderDriverLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_provider_driver_links"
    __table_args__ = (
        UniqueConstraint("provider_id", "driver_id", name="uq_vts_provider_driver_link"),
    )

    provider_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vts_providers.id", ondelete="CASCADE"), index=True
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[DriverLinkStatus] = mapped_column(
        Enum(DriverLinkStatus, native_enum=False, length=40), index=True
    )
    requested_by: Mapped[DriverLinkSource] = mapped_column(
        Enum(DriverLinkSource, native_enum=False, length=24), index=True
    )
    requested_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    responded_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class VehicleOwnerDriverLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_owner_driver_links"
    __table_args__ = (
        UniqueConstraint("owner_id", "driver_id", name="uq_vehicle_owner_driver_link"),
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vehicle_owners.id", ondelete="CASCADE"), index=True
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[DriverLinkStatus] = mapped_column(
        Enum(DriverLinkStatus, native_enum=False, length=40), index=True
    )
    requested_by: Mapped[DriverLinkSource] = mapped_column(
        Enum(DriverLinkSource, native_enum=False, length=24), index=True
    )
    requested_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    responded_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
