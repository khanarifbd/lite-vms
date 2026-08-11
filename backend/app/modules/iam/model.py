from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.common.enums import (
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    TenantStatus,
    TenantType,
)
from app.db.base import (
    BIGINT_PK,
    Base,
    BigIntPrimaryKeyMixin,
    PublicIDMixin,
    TimestampMixin,
)


class Tenant(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180))
    tenant_type: Mapped[TenantType] = mapped_column(
        Enum(TenantType, native_enum=False, length=40), index=True
    )
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, native_enum=False, length=24),
        default=TenantStatus.ACTIVE,
        index=True,
    )


class Organization(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_organizations_tenant_code"),)

    tenant_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        BIGINT_PK,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    organization_type: Mapped[OrganizationType] = mapped_column(
        Enum(OrganizationType, native_enum=False, length=50), index=True
    )
    code: Mapped[str] = mapped_column(String(80), index=True)
    name_en: Mapped[str] = mapped_column(String(180))
    name_bn: Mapped[str | None] = mapped_column(String(180), nullable=True)
    registration_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[OrganizationStatus] = mapped_column(
        Enum(OrganizationStatus, native_enum=False, length=24),
        default=OrganizationStatus.ACTIVE,
        index=True,
    )


class Role(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(140))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class Permission(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


class RolePermission(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_pair"),
    )

    role_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("roles.id", ondelete="CASCADE"), index=True
    )
    permission_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("permissions.id", ondelete="CASCADE"), index=True
    )


class OrganizationMembership(BigIntPrimaryKeyMixin, PublicIDMixin, TimestampMixin, Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", "valid_from", name="uq_memberships_period"),
    )

    user_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    tenant_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("tenants.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[MembershipStatus] = mapped_column(
        Enum(MembershipStatus, native_enum=False, length=24),
        default=MembershipStatus.ACTIVE,
        index=True,
    )
    member_code: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    designation: Mapped[str | None] = mapped_column(String(140), nullable=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by_id: Mapped[int | None] = mapped_column(
        BIGINT_PK, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MembershipRole(BigIntPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "membership_roles"
    __table_args__ = (
        UniqueConstraint("membership_id", "role_id", name="uq_membership_roles_pair"),
    )

    membership_id: Mapped[int] = mapped_column(
        BIGINT_PK,
        ForeignKey("organization_memberships.id", ondelete="CASCADE"),
        index=True,
    )
    role_id: Mapped[int] = mapped_column(
        BIGINT_PK, ForeignKey("roles.id", ondelete="CASCADE"), index=True
    )
