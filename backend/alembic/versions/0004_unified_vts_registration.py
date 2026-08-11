"""Add unified VTS provider registration and review workflow.

Revision ID: 0004_unified_vts_registration
Revises: 0003_identity_and_tenancy
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_unified_vts_registration"
down_revision: str | None = "0003_identity_and_tenancy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
provider_document_type = sa.Enum(
    "BTRC_LICENSE",
    "TRADE_LICENSE",
    "INCORPORATION_CERTIFICATE",
    "TIN_CERTIFICATE",
    "BIN_CERTIFICATE",
    "AUTHORIZED_PERSON_ID",
    "OTHER",
    name="providerdocumenttype",
    native_enum=False,
)
provider_document_status = sa.Enum(
    "PENDING",
    "VERIFIED",
    "REJECTED",
    name="providerdocumentstatus",
    native_enum=False,
)


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    with op.batch_alter_table("vts_providers") as batch:
        batch.add_column(sa.Column("tenant_id", bigint_pk, nullable=True))
        batch.add_column(sa.Column("root_organization_id", bigint_pk, nullable=True))
        batch.add_column(sa.Column("primary_admin_user_id", bigint_pk, nullable=True))
        batch.add_column(sa.Column("application_number", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("trade_name", sa.String(length=180), nullable=True))
        batch.add_column(sa.Column("trade_license_number", sa.String(length=120), nullable=True))
        batch.add_column(
            sa.Column("company_registration_number", sa.String(length=120), nullable=True)
        )
        batch.add_column(sa.Column("tin_number", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("bin_number", sa.String(length=80), nullable=True))
        batch.add_column(sa.Column("registered_address", sa.Text(), nullable=True))
        batch.add_column(sa.Column("district", sa.String(length=100), nullable=True))
        batch.add_column(sa.Column("website_url", sa.String(length=500), nullable=True))
        batch.add_column(sa.Column("technical_contact_name", sa.String(length=120), nullable=True))
        batch.add_column(
            sa.Column("technical_contact_phone", sa.String(length=30), nullable=True)
        )
        batch.add_column(
            sa.Column("technical_contact_email", sa.String(length=180), nullable=True)
        )
        batch.add_column(sa.Column("api_base_url", sa.String(length=500), nullable=True))
        batch.add_column(
            sa.Column("estimated_vehicle_count", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(
            sa.Column("current_platform_name", sa.String(length=180), nullable=True)
        )
        batch.add_column(
            sa.Column("data_submission_interval_seconds", sa.Integer(), nullable=True)
        )
        batch.add_column(
            sa.Column("declaration_accepted", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(
            sa.Column("declaration_accepted_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch.add_column(sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("reviewed_by_id", bigint_pk, nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("review_notes", sa.Text(), nullable=True))
        batch.create_foreign_key(
            "fk_vts_providers_tenant_id_tenants",
            "tenants",
            ["tenant_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_foreign_key(
            "fk_vts_providers_root_organization_id_organizations",
            "organizations",
            ["root_organization_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_foreign_key(
            "fk_vts_providers_primary_admin_user_id_users",
            "users",
            ["primary_admin_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            "fk_vts_providers_reviewed_by_id_users",
            "users",
            ["reviewed_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_unique_constraint("uq_vts_providers_tenant_id", ["tenant_id"])
        batch.create_unique_constraint(
            "uq_vts_providers_root_organization_id", ["root_organization_id"]
        )
        batch.create_unique_constraint(
            "uq_vts_providers_application_number", ["application_number"]
        )
        for column in (
            "tenant_id",
            "root_organization_id",
            "primary_admin_user_id",
            "application_number",
            "license_number",
            "trade_license_number",
            "company_registration_number",
            "tin_number",
            "bin_number",
            "district",
            "reviewed_by_id",
        ):
            batch.create_index(op.f(f"ix_vts_providers_{column}"), [column])

    op.create_table(
        "vts_provider_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", provider_document_type, nullable=False),
        sa.Column("document_number", sa.String(length=160), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", provider_document_status, nullable=False),
        sa.Column("verified_by_id", bigint_pk, nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["vts_providers.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["verified_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vts_provider_documents")),
    )
    for column in ("provider_id", "document_type", "status"):
        op.create_index(
            op.f(f"ix_vts_provider_documents_{column}"),
            "vts_provider_documents",
            [column],
        )

    op.create_table(
        "vts_provider_allowed_ips",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("ip_address", sa.String(length=64), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["vts_providers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vts_provider_allowed_ips")),
        sa.UniqueConstraint(
            "provider_id", "ip_address", name="uq_vts_provider_allowed_ip"
        ),
    )
    op.create_index(
        op.f("ix_vts_provider_allowed_ips_provider_id"),
        "vts_provider_allowed_ips",
        ["provider_id"],
    )
    op.create_index(
        op.f("ix_vts_provider_allowed_ips_ip_address"),
        "vts_provider_allowed_ips",
        ["ip_address"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_vts_provider_allowed_ips_ip_address"),
        table_name="vts_provider_allowed_ips",
    )
    op.drop_index(
        op.f("ix_vts_provider_allowed_ips_provider_id"),
        table_name="vts_provider_allowed_ips",
    )
    op.drop_table("vts_provider_allowed_ips")

    for column in ("status", "document_type", "provider_id"):
        op.drop_index(
            op.f(f"ix_vts_provider_documents_{column}"),
            table_name="vts_provider_documents",
        )
    op.drop_table("vts_provider_documents")

    with op.batch_alter_table("vts_providers") as batch:
        for column in (
            "reviewed_by_id",
            "district",
            "bin_number",
            "tin_number",
            "company_registration_number",
            "trade_license_number",
            "license_number",
            "application_number",
            "primary_admin_user_id",
            "root_organization_id",
            "tenant_id",
        ):
            batch.drop_index(op.f(f"ix_vts_providers_{column}"))
        batch.drop_constraint("uq_vts_providers_application_number", type_="unique")
        batch.drop_constraint("uq_vts_providers_root_organization_id", type_="unique")
        batch.drop_constraint("uq_vts_providers_tenant_id", type_="unique")
        batch.drop_constraint(
            "fk_vts_providers_reviewed_by_id_users", type_="foreignkey"
        )
        batch.drop_constraint(
            "fk_vts_providers_primary_admin_user_id_users", type_="foreignkey"
        )
        batch.drop_constraint(
            "fk_vts_providers_root_organization_id_organizations", type_="foreignkey"
        )
        batch.drop_constraint("fk_vts_providers_tenant_id_tenants", type_="foreignkey")
        for column in (
            "review_notes",
            "reviewed_at",
            "reviewed_by_id",
            "submitted_at",
            "declaration_accepted_at",
            "declaration_accepted",
            "data_submission_interval_seconds",
            "current_platform_name",
            "estimated_vehicle_count",
            "api_base_url",
            "technical_contact_email",
            "technical_contact_phone",
            "technical_contact_name",
            "website_url",
            "district",
            "registered_address",
            "bin_number",
            "tin_number",
            "company_registration_number",
            "trade_license_number",
            "trade_name",
            "application_number",
            "primary_admin_user_id",
            "root_organization_id",
            "tenant_id",
        ):
            batch.drop_column(column)
