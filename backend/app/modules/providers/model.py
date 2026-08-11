import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
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

from app.common.enums import ProviderDocumentStatus, ProviderDocumentType, ProviderStatus
from app.db.base import BIGINT_PK, Base, TimestampMixin, UUIDPrimaryKeyMixin


class VTSProvider(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_providers"

    tenant_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("tenants.id", ondelete="RESTRICT"), unique=True, nullable=True, index=True
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
        unique=True,
        nullable=True,
        index=True,
    )
    application_number: Mapped[str | None] = mapped_column(
        String(40), unique=True, nullable=True, index=True
    )
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180), unique=True)
    trade_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    company_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    incorporation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    btrc_license_issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    btrc_license_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    trade_license_number: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    trade_license_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    company_registration_number: Mapped[str | None] = mapped_column(
        String(120), nullable=True, index=True
    )
    tin_number: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    bin_number: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    registered_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    district: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    authorized_representative_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    authorized_representative_nid: Mapped[str | None] = mapped_column(String(120), nullable=True)
    authorized_representative_designation: Mapped[str | None] = mapped_column(String(140), nullable=True)
    authorized_representative_mobile: Mapped[str | None] = mapped_column(String(30), nullable=True)
    authorized_representative_email: Mapped[str | None] = mapped_column(String(180), nullable=True)

    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    technical_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    technical_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    technical_contact_email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    operations_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    operations_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    operations_contact_email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    support_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    support_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    support_contact_email: Mapped[str | None] = mapped_column(String(180), nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    emergency_contact_email: Mapped[str | None] = mapped_column(String(180), nullable=True)

    service_coverage: Mapped[list[str]] = mapped_column(JSON, default=list)
    supported_protocols: Mapped[list[str]] = mapped_column(JSON, default=list)
    supported_device_brands: Mapped[list[str]] = mapped_column(JSON, default=list)
    api_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    estimated_vehicle_count: Mapped[int] = mapped_column(Integer, default=0)
    current_platform_name: Mapped[str | None] = mapped_column(String(180), nullable=True)
    data_submission_interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    integration_status: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    last_telemetry_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    declaration_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    declaration_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ProviderStatus] = mapped_column(
        Enum(ProviderStatus, native_enum=False, length=24),
        default=ProviderStatus.PENDING,
        index=True,
    )


class VTSProviderDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_provider_documents"

    provider_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vts_providers.id", ondelete="CASCADE"), index=True
    )
    document_type: Mapped[ProviderDocumentType] = mapped_column(
        Enum(ProviderDocumentType, native_enum=False, length=40), index=True
    )
    document_number: Mapped[str | None] = mapped_column(String(160), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("vts_provider_documents.id", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[ProviderDocumentStatus] = mapped_column(
        Enum(ProviderDocumentStatus, native_enum=False, length=20),
        default=ProviderDocumentStatus.PENDING,
        index=True,
    )
    verified_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class VTSProviderAllowedIP(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_provider_allowed_ips"
    __table_args__ = (
        UniqueConstraint("provider_id", "ip_address", name="uq_vts_provider_allowed_ip"),
    )

    provider_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("vts_providers.id", ondelete="CASCADE"), index=True
    )
    ip_address: Mapped[str] = mapped_column(String(64), index=True)
