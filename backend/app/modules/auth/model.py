import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import (
    IdentifierType,
    IdentityAssuranceLevel,
    IdentityVerificationStatus,
    UserStatus,
)
from app.db.base import (
    BIGINT_PK,
    Base,
    BigIntPrimaryKeyMixin,
    PublicIDMixin,
    TimestampMixin,
)


class User(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(180), index=True)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, native_enum=False, length=24),
        default=UserStatus.ACTIVE,
        index=True,
    )
    preferred_language: Mapped[str] = mapped_column(String(12), default="bn")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Dhaka")
    identity_verification_status: Mapped[IdentityVerificationStatus] = mapped_column(
        Enum(IdentityVerificationStatus, native_enum=False, length=24),
        default=IdentityVerificationStatus.UNVERIFIED,
        index=True,
    )
    identity_assurance_level: Mapped[IdentityAssuranceLevel] = mapped_column(
        Enum(IdentityAssuranceLevel, native_enum=False, length=24),
        default=IdentityAssuranceLevel.BASIC,
    )
    created_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE and self.deleted_at is None


class UserIdentifier(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "user_identifiers"
    __table_args__ = (
        UniqueConstraint(
            "identifier_type", "normalized_value", name="uq_user_identifiers_type_value"
        ),
        Index(
            "uq_user_identifiers_one_active_primary",
            "user_id",
            unique=True,
            sqlite_where=text("is_primary = 1 AND disabled_at IS NULL"),
            postgresql_where=text("is_primary = true AND disabled_at IS NULL"),
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    identifier_type: Mapped[IdentifierType] = mapped_column(
        Enum(IdentifierType, native_enum=False, length=50), index=True
    )
    normalized_value: Mapped[str] = mapped_column(String(255), index=True)
    masked_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_method: Mapped[str | None] = mapped_column(String(80), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserSecurity(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_security"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(String(255))
    password_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_login_device: Mapped[str | None] = mapped_column(String(500), nullable=True)


class UserSession(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_jti: Mapped[uuid.UUID] = mapped_column(unique=True, index=True)
    token_version: Mapped[int] = mapped_column(Integer)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)


class IdentityDocument(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "identity_documents"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    document_type: Mapped[str] = mapped_column(String(60), index=True)
    encrypted_document_number: Mapped[str] = mapped_column(Text)
    document_number_hmac: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    masked_number: Mapped[str] = mapped_column(String(80))
    issuing_country: Mapped[str] = mapped_column(String(3), default="BGD")
    verification_status: Mapped[IdentityVerificationStatus] = mapped_column(
        Enum(IdentityVerificationStatus, native_enum=False, length=24),
        default=IdentityVerificationStatus.UNVERIFIED,
        index=True,
    )
    verification_source: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(180), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PoliceProfile(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "police_profiles"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    service_number: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    badge_number: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)
    rank: Mapped[str | None] = mapped_column(String(100), nullable=True)
    designation: Mapped[str | None] = mapped_column(String(140), nullable=True)
    joining_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    jurisdiction_code: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)


class VTSUserProfile(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "vts_user_profiles"

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    employee_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    designation: Mapped[str | None] = mapped_column(String(140), nullable=True)
    is_technical_contact: Mapped[bool] = mapped_column(Boolean, default=False)
