"""Introduce national-scale identity, tenancy, and authorization schema.

Revision ID: 0003_identity_and_tenancy
Revises: 0002_add_auth_users
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_identity_and_tenancy"
down_revision: str | None = "0002_add_auth_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")

user_status = sa.Enum(
    "PENDING", "ACTIVE", "SUSPENDED", "LOCKED", "DISABLED", "DELETED",
    name="userstatus", native_enum=False,
)
verification_status = sa.Enum(
    "UNVERIFIED", "PENDING", "VERIFIED", "REJECTED",
    name="identityverificationstatus", native_enum=False,
)
assurance_level = sa.Enum(
    "BASIC", "SUBSTANTIAL", "HIGH",
    name="identityassurancelevel", native_enum=False,
)
identifier_type = sa.Enum(
    "EMAIL", "MOBILE", "POLICE_SERVICE_NUMBER", "BADGE_NUMBER",
    "VTS_EMPLOYEE_ID", "OWNER_REGISTRATION_REFERENCE",
    "GOVERNMENT_IDENTITY_REFERENCE",
    name="identifiertype", native_enum=False,
)
tenant_type = sa.Enum(
    "SYSTEM", "POLICE", "GOVERNMENT", "VTS_PROVIDER", "VEHICLE_OWNER", "AUDITOR",
    name="tenanttype", native_enum=False,
)
tenant_status = sa.Enum(
    "PENDING", "ACTIVE", "SUSPENDED", "DISABLED",
    name="tenantstatus", native_enum=False,
)
organization_type = sa.Enum(
    "SYSTEM", "BANGLADESH_POLICE", "POLICE_UNIT", "BRTA", "VTS_PROVIDER",
    "VEHICLE_OWNER_COMPANY", "INDIVIDUAL_VEHICLE_OWNER", "GOVERNMENT_AGENCY", "AUDITOR",
    name="organizationtype", native_enum=False,
)
organization_status = sa.Enum(
    "PENDING", "ACTIVE", "SUSPENDED", "DISABLED",
    name="organizationstatus", native_enum=False,
)
membership_status = sa.Enum(
    "PENDING", "ACTIVE", "SUSPENDED", "ENDED",
    name="membershipstatus", native_enum=False,
)


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def public_id_column() -> sa.Column:
    return sa.Column("public_id", sa.Uuid(), nullable=False)


def upgrade() -> None:
    # Development-stage reset: replace the original account table with the scalable identity model.
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_index(op.f("ix_users_is_active"), table_name="users")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_table("users")

    op.create_table(
        "users",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("display_name", sa.String(length=180), nullable=False),
        sa.Column("status", user_status, nullable=False),
        sa.Column("preferred_language", sa.String(length=12), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("identity_verification_status", verification_status, nullable=False),
        sa.Column("identity_assurance_level", assurance_level, nullable=False),
        sa.Column("created_by_id", bigint_pk, nullable=True),
        sa.Column("updated_by_id", bigint_pk, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by_id", bigint_pk, nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("public_id", name=op.f("uq_users_public_id")),
    )
    op.create_index(op.f("ix_users_public_id"), "users", ["public_id"])
    op.create_index(op.f("ix_users_display_name"), "users", ["display_name"])
    op.create_index(op.f("ix_users_status"), "users", ["status"])
    op.create_index(
        op.f("ix_users_identity_verification_status"),
        "users",
        ["identity_verification_status"],
    )

    op.create_table(
        "tenants",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("tenant_type", tenant_type, nullable=False),
        sa.Column("status", tenant_status, nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tenants")),
        sa.UniqueConstraint("code", name=op.f("uq_tenants_code")),
        sa.UniqueConstraint("public_id", name=op.f("uq_tenants_public_id")),
    )
    for column in ("public_id", "code", "tenant_type", "status"):
        op.create_index(op.f(f"ix_tenants_{column}"), "tenants", [column])

    op.create_table(
        "organizations",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("tenant_id", bigint_pk, nullable=False),
        sa.Column("parent_id", bigint_pk, nullable=True),
        sa.Column("organization_type", organization_type, nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name_en", sa.String(length=180), nullable=False),
        sa.Column("name_bn", sa.String(length=180), nullable=True),
        sa.Column("registration_number", sa.String(length=120), nullable=True),
        sa.Column("status", organization_status, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["organizations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
        sa.UniqueConstraint("public_id", name=op.f("uq_organizations_public_id")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_organizations_tenant_code"),
    )
    for column in ("public_id", "tenant_id", "parent_id", "organization_type", "code", "status"):
        op.create_index(op.f(f"ix_organizations_{column}"), "organizations", [column])

    op.create_table(
        "roles",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("code", name=op.f("uq_roles_code")),
        sa.UniqueConstraint("public_id", name=op.f("uq_roles_public_id")),
    )
    for column in ("public_id", "code", "is_active"):
        op.create_index(op.f(f"ix_roles_{column}"), "roles", [column])

    op.create_table(
        "permissions",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("code", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permissions")),
        sa.UniqueConstraint("code", name=op.f("uq_permissions_code")),
        sa.UniqueConstraint("public_id", name=op.f("uq_permissions_public_id")),
    )
    op.create_index(op.f("ix_permissions_public_id"), "permissions", ["public_id"])
    op.create_index(op.f("ix_permissions_code"), "permissions", ["code"])

    op.create_table(
        "role_permissions",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("role_id", bigint_pk, nullable=False),
        sa.Column("permission_id", bigint_pk, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_role_permissions")),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_pair"),
    )
    op.create_index(op.f("ix_role_permissions_role_id"), "role_permissions", ["role_id"])
    op.create_index(
        op.f("ix_role_permissions_permission_id"), "role_permissions", ["permission_id"]
    )

    op.create_table(
        "user_identifiers",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("identifier_type", identifier_type, nullable=False),
        sa.Column("normalized_value", sa.String(length=255), nullable=False),
        sa.Column("masked_value", sa.String(length=255), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("is_verified", sa.Boolean(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verification_method", sa.String(length=80), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_identifiers")),
        sa.UniqueConstraint("public_id", name=op.f("uq_user_identifiers_public_id")),
        sa.UniqueConstraint(
            "identifier_type", "normalized_value", name="uq_user_identifiers_type_value"
        ),
    )
    for column in ("public_id", "user_id", "identifier_type", "normalized_value", "is_verified"):
        op.create_index(op.f(f"ix_user_identifiers_{column}"), "user_identifiers", [column])

    op.create_table(
        "user_security",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False),
        sa.Column("mfa_method", sa.String(length=40), nullable=True),
        sa.Column("failed_login_count", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_ip", sa.String(length=64), nullable=True),
        sa.Column("last_login_device", sa.String(length=500), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_security")),
        sa.UniqueConstraint("user_id", name=op.f("uq_user_security_user_id")),
    )
    op.create_index(op.f("ix_user_security_user_id"), "user_security", ["user_id"])

    op.create_table(
        "user_sessions",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("token_jti", sa.Uuid(), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_sessions")),
        sa.UniqueConstraint("public_id", name=op.f("uq_user_sessions_public_id")),
        sa.UniqueConstraint("token_jti", name=op.f("uq_user_sessions_token_jti")),
    )
    for column in ("public_id", "user_id", "token_jti", "issued_at", "expires_at"):
        op.create_index(op.f(f"ix_user_sessions_{column}"), "user_sessions", [column])

    op.create_table(
        "organization_memberships",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("tenant_id", bigint_pk, nullable=False),
        sa.Column("organization_id", bigint_pk, nullable=False),
        sa.Column("status", membership_status, nullable=False),
        sa.Column("member_code", sa.String(length=100), nullable=True),
        sa.Column("designation", sa.String(length=140), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("approved_by_id", bigint_pk, nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organization_memberships")),
        sa.UniqueConstraint("public_id", name=op.f("uq_organization_memberships_public_id")),
        sa.UniqueConstraint("user_id", "organization_id", "valid_from", name="uq_memberships_period"),
    )
    for column in ("public_id", "user_id", "tenant_id", "organization_id", "status", "member_code"):
        op.create_index(
            op.f(f"ix_organization_memberships_{column}"),
            "organization_memberships",
            [column],
        )

    op.create_table(
        "membership_roles",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("membership_id", bigint_pk, nullable=False),
        sa.Column("role_id", bigint_pk, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["membership_id"], ["organization_memberships.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_membership_roles")),
        sa.UniqueConstraint("membership_id", "role_id", name="uq_membership_roles_pair"),
    )
    op.create_index(op.f("ix_membership_roles_membership_id"), "membership_roles", ["membership_id"])
    op.create_index(op.f("ix_membership_roles_role_id"), "membership_roles", ["role_id"])

    op.create_table(
        "identity_documents",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("document_type", sa.String(length=60), nullable=False),
        sa.Column("encrypted_document_number", sa.Text(), nullable=False),
        sa.Column("document_number_hmac", sa.String(length=128), nullable=False),
        sa.Column("masked_number", sa.String(length=80), nullable=False),
        sa.Column("issuing_country", sa.String(length=3), nullable=False),
        sa.Column("verification_status", verification_status, nullable=False),
        sa.Column("verification_source", sa.String(length=100), nullable=True),
        sa.Column("external_reference", sa.String(length=180), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_by_id", bigint_pk, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_identity_documents")),
        sa.UniqueConstraint("public_id", name=op.f("uq_identity_documents_public_id")),
        sa.UniqueConstraint("document_number_hmac", name=op.f("uq_identity_documents_document_number_hmac")),
    )
    for column in ("public_id", "user_id", "document_type", "document_number_hmac", "verification_status"):
        op.create_index(op.f(f"ix_identity_documents_{column}"), "identity_documents", [column])

    op.create_table(
        "police_profiles",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("service_number", sa.String(length=100), nullable=False),
        sa.Column("badge_number", sa.String(length=100), nullable=True),
        sa.Column("rank", sa.String(length=100), nullable=True),
        sa.Column("designation", sa.String(length=140), nullable=True),
        sa.Column("joining_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("jurisdiction_code", sa.String(length=100), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_police_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_police_profiles_user_id")),
        sa.UniqueConstraint("service_number", name=op.f("uq_police_profiles_service_number")),
        sa.UniqueConstraint("badge_number", name=op.f("uq_police_profiles_badge_number")),
    )
    op.create_index(op.f("ix_police_profiles_service_number"), "police_profiles", ["service_number"])
    op.create_index(op.f("ix_police_profiles_jurisdiction_code"), "police_profiles", ["jurisdiction_code"])

    op.create_table(
        "vts_user_profiles",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("employee_id", sa.String(length=100), nullable=True),
        sa.Column("designation", sa.String(length=140), nullable=True),
        sa.Column("is_technical_contact", sa.Boolean(), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vts_user_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_vts_user_profiles_user_id")),
    )
    op.create_index(op.f("ix_vts_user_profiles_employee_id"), "vts_user_profiles", ["employee_id"])

    op.create_table(
        "owner_profiles",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("owner_type", sa.String(length=40), nullable=False),
        sa.Column("owner_registry_reference", sa.String(length=120), nullable=True),
        sa.Column("company_name", sa.String(length=180), nullable=True),
        sa.Column("trade_license_reference", sa.String(length=120), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_owner_profiles")),
        sa.UniqueConstraint("user_id", name=op.f("uq_owner_profiles_user_id")),
        sa.UniqueConstraint(
            "owner_registry_reference", name=op.f("uq_owner_profiles_owner_registry_reference")
        ),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", bigint_pk, autoincrement=True, nullable=False),
        public_id_column(),
        sa.Column("tenant_id", bigint_pk, nullable=True),
        sa.Column("actor_user_id", bigint_pk, nullable=True),
        sa.Column("actor_organization_id", bigint_pk, nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("resource_type", sa.String(length=100), nullable=False),
        sa.Column("resource_public_id", sa.Uuid(), nullable=True),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("previous_values", sa.JSON(), nullable=True),
        sa.Column("new_values", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["actor_organization_id"], ["organizations.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
        sa.UniqueConstraint("public_id", name=op.f("uq_audit_logs_public_id")),
    )
    for column in (
        "public_id", "tenant_id", "actor_user_id", "actor_organization_id",
        "action", "resource_type", "resource_public_id", "request_id",
    ):
        op.create_index(op.f(f"ix_audit_logs_{column}"), "audit_logs", [column])


def downgrade() -> None:
    for table in (
        "audit_logs", "owner_profiles", "vts_user_profiles", "police_profiles",
        "identity_documents", "membership_roles", "organization_memberships",
        "user_sessions", "user_security", "user_identifiers", "role_permissions",
        "permissions", "roles", "organizations", "tenants", "users",
    ):
        op.drop_table(table)

    old_role = sa.Enum(
        "SUPER_ADMIN", "POLICE_ADMIN", "POLICE_OFFICER", "VTS_ADMIN", "VEHICLE_OWNER",
        name="userrole", native_enum=False,
    )
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=180), nullable=False),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", old_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"])
    op.create_index(op.f("ix_users_is_active"), "users", ["is_active"])
    op.create_index(op.f("ix_users_role"), "users", ["role"])
