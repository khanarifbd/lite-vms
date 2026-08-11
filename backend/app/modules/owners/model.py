import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import (
    EntityStatus,
    OwnerDocumentStatus,
    OwnerDocumentType,
    OwnerType,
    OwnerVerificationStatus,
)
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin, utc_now
from app.modules.owners.enums import (
    OwnerClaimStatus,
    OwnerProviderLinkStatus,
    OwnerProviderRequestSource,
    OwnerProviderVehicleScopeMode,
)


class VehicleOwner(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_owners"

    tenant_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("tenants.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )
    root_organization_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("organizations.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )
    primary_admin_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_provider_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    application_number: Mapped[str | None] = mapped_column(
        String(40), unique=True, nullable=True, index=True
    )
    owner_code: Mapped[str | None] = mapped_column(
        String(40), unique=True, nullable=True, index=True
    )
    owner_type: Mapped[OwnerType] = mapped_column(
        Enum(OwnerType, native_enum=False, length=24),
        default=OwnerType.INDIVIDUAL,
        index=True,
    )
    claim_status: Mapped[OwnerClaimStatus] = mapped_column(
        Enum(OwnerClaimStatus, native_enum=False, length=24),
        default=OwnerClaimStatus.CLAIMED,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(180), index=True)
    nid_or_registration: Mapped[str] = mapped_column(
        String(120), unique=True, nullable=False, index=True
    )

    # Individual owner profile.
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(30), nullable=True)
    profile_photo_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    present_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    permanent_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    division: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    upazila: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    alternate_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Company owner profile.
    company_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    incorporation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    authorized_person_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    authorized_person_nid: Mapped[str | None] = mapped_column(String(120), nullable=True)
    authorized_person_designation: Mapped[str | None] = mapped_column(String(140), nullable=True)
    authorized_person_mobile: Mapped[str | None] = mapped_column(String(30), nullable=True)
    authorized_person_email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    company_logo_storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    head_office_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    operating_address: Mapped[str | None] = mapped_column(Text, nullable=True)

    trade_license_number: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    tin_number: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    bin_number: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    # Business contact fields. Login identifiers remain authoritative in UserIdentifier.
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    declaration_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    declaration_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[OwnerVerificationStatus] = mapped_column(
        Enum(OwnerVerificationStatus, native_enum=False, length=32),
        default=OwnerVerificationStatus.PENDING,
        index=True,
    )
    status: Mapped[EntityStatus] = mapped_column(
        Enum(EntityStatus, native_enum=False, length=20),
        default=EntityStatus.ACTIVE,
        index=True,
    )


class VehicleOwnerDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vehicle_owner_documents"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="CASCADE"),
        index=True,
    )
    document_type: Mapped[OwnerDocumentType] = mapped_column(
        Enum(OwnerDocumentType, native_enum=False, length=40), index=True
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
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owner_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[OwnerDocumentStatus] = mapped_column(
        Enum(OwnerDocumentStatus, native_enum=False, length=20),
        default=OwnerDocumentStatus.PENDING,
        index=True,
    )
    verified_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class VTSProviderOwnerLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_provider_owner_links"
    __table_args__ = (
        UniqueConstraint("provider_id", "owner_id", name="uq_vts_provider_owner_link"),
    )

    provider_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_providers.id", ondelete="CASCADE"),
        index=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicle_owners.id", ondelete="CASCADE"),
        index=True,
    )
    status: Mapped[OwnerProviderLinkStatus] = mapped_column(
        Enum(OwnerProviderLinkStatus, native_enum=False, length=40),
        index=True,
    )
    requested_by: Mapped[OwnerProviderRequestSource] = mapped_column(
        Enum(OwnerProviderRequestSource, native_enum=False, length=20),
        index=True,
    )
    vehicle_scope_mode: Mapped[OwnerProviderVehicleScopeMode] = mapped_column(
        Enum(OwnerProviderVehicleScopeMode, native_enum=False, length=20),
        default=OwnerProviderVehicleScopeMode.ALL,
        index=True,
    )
    requested_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    responded_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class VTSProviderOwnerVehicleAccess(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_provider_owner_vehicle_access"

    link_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_provider_owner_links.id", ondelete="CASCADE"),
        index=True,
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE"),
        index=True,
    )
    granted_by_user_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="RESTRICT"),
        index=True,
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    revoked_by_user_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
