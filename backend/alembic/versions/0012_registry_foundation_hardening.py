"""Harden registry profiles, documents, vehicles and device identities.

Revision ID: 0012_registry_foundation
Revises: 0011_vehicle_management
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_registry_foundation"
down_revision: str | None = "0011_vehicle_management"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SQLITE_NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def add_columns(table: str, columns: list[sa.Column]) -> None:
    with op.batch_alter_table(table) as batch_op:
        for column in columns:
            batch_op.add_column(column)


def add_versioned_document_columns(table: str) -> None:
    with op.batch_alter_table(table) as batch_op:
        batch_op.alter_column("file_url", existing_type=sa.String(1000), nullable=True)
        batch_op.add_column(sa.Column("storage_key", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("content_type", sa.String(120), nullable=True))
        batch_op.add_column(sa.Column("size_bytes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(sa.Column("replaced_by_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            f"fk_{table}_replaced_by_id",
            table,
            ["replaced_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(f"ix_{table}_storage_key", table, ["storage_key"])
    op.create_index(f"ix_{table}_is_active", table, ["is_active"])
    op.execute(
        sa.text(
            f"UPDATE {table} SET storage_key = file_url "
            "WHERE storage_key IS NULL AND file_url IS NOT NULL"
        )
    )


def replace_tracking_device_identity_constraint() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    unique_constraints = inspector.get_unique_constraints("tracking_devices")

    target_constraint_name: str | None = None
    target_index_name: str | None = None
    for constraint in unique_constraints:
        if constraint.get("column_names") == ["device_identifier"]:
            target_constraint_name = constraint.get("name")
            break

    # Some dialects expose a unique constraint's backing index as an index as
    # well. Only inspect/drop a standalone index when no constraint was found.
    if target_constraint_name is None:
        for index in inspector.get_indexes("tracking_devices"):
            if index.get("unique") and index.get("column_names") == ["device_identifier"]:
                target_index_name = index.get("name")
                break

    dialect_name = bind.dialect.name
    if dialect_name == "sqlite" and target_constraint_name is None and target_index_name is None:
        target_constraint_name = "uq_tracking_devices_device_identifier"

    batch_kwargs: dict[str, object] = {}
    if dialect_name == "sqlite":
        batch_kwargs["recreate"] = "always"
        batch_kwargs["naming_convention"] = SQLITE_NAMING_CONVENTION

    with op.batch_alter_table("tracking_devices", **batch_kwargs) as batch_op:
        if target_constraint_name:
            batch_op.drop_constraint(target_constraint_name, type_="unique")
        elif target_index_name:
            batch_op.drop_index(target_index_name)
        batch_op.create_unique_constraint(
            "uq_tracking_device_source_identifier",
            ["source_id", "device_identifier"],
        )


def upgrade() -> None:
    add_columns(
        "vehicle_owners",
        [
            sa.Column("date_of_birth", sa.Date(), nullable=True),
            sa.Column("father_name", sa.String(180), nullable=True),
            sa.Column("mother_name", sa.String(180), nullable=True),
            sa.Column("gender", sa.String(30), nullable=True),
            sa.Column("profile_photo_storage_key", sa.String(500), nullable=True),
            sa.Column("present_address", sa.Text(), nullable=True),
            sa.Column("permanent_address", sa.Text(), nullable=True),
            sa.Column("division", sa.String(100), nullable=True),
            sa.Column("upazila", sa.String(100), nullable=True),
            sa.Column("postal_code", sa.String(20), nullable=True),
            sa.Column("alternate_phone", sa.String(30), nullable=True),
            sa.Column("company_type", sa.String(80), nullable=True),
            sa.Column("incorporation_date", sa.Date(), nullable=True),
            sa.Column("authorized_person_name", sa.String(180), nullable=True),
            sa.Column("authorized_person_nid", sa.String(120), nullable=True),
            sa.Column("authorized_person_designation", sa.String(140), nullable=True),
            sa.Column("authorized_person_mobile", sa.String(30), nullable=True),
            sa.Column("authorized_person_email", sa.String(180), nullable=True),
            sa.Column("company_logo_storage_key", sa.String(500), nullable=True),
            sa.Column("head_office_address", sa.Text(), nullable=True),
            sa.Column("operating_address", sa.Text(), nullable=True),
        ],
    )
    op.create_index("ix_vehicle_owners_division", "vehicle_owners", ["division"])
    op.create_index("ix_vehicle_owners_upazila", "vehicle_owners", ["upazila"])

    add_columns(
        "vts_providers",
        [
            sa.Column("company_type", sa.String(80), nullable=True),
            sa.Column("incorporation_date", sa.Date(), nullable=True),
            sa.Column("btrc_license_issue_date", sa.Date(), nullable=True),
            sa.Column("btrc_license_expiry_date", sa.Date(), nullable=True),
            sa.Column("trade_license_expiry_date", sa.Date(), nullable=True),
            sa.Column("authorized_representative_name", sa.String(180), nullable=True),
            sa.Column("authorized_representative_nid", sa.String(120), nullable=True),
            sa.Column("authorized_representative_designation", sa.String(140), nullable=True),
            sa.Column("authorized_representative_mobile", sa.String(30), nullable=True),
            sa.Column("authorized_representative_email", sa.String(180), nullable=True),
            sa.Column("operations_contact_name", sa.String(120), nullable=True),
            sa.Column("operations_contact_phone", sa.String(30), nullable=True),
            sa.Column("operations_contact_email", sa.String(180), nullable=True),
            sa.Column("support_contact_name", sa.String(120), nullable=True),
            sa.Column("support_contact_phone", sa.String(30), nullable=True),
            sa.Column("support_contact_email", sa.String(180), nullable=True),
            sa.Column("emergency_contact_name", sa.String(120), nullable=True),
            sa.Column("emergency_contact_phone", sa.String(30), nullable=True),
            sa.Column("emergency_contact_email", sa.String(180), nullable=True),
            sa.Column("service_coverage", sa.JSON(), nullable=True),
            sa.Column("supported_protocols", sa.JSON(), nullable=True),
            sa.Column("supported_device_brands", sa.JSON(), nullable=True),
            sa.Column("integration_status", sa.String(40), nullable=True),
            sa.Column("last_telemetry_received_at", sa.DateTime(timezone=True), nullable=True),
        ],
    )
    op.create_index(
        "ix_vts_providers_btrc_license_expiry_date",
        "vts_providers",
        ["btrc_license_expiry_date"],
    )
    op.create_index(
        "ix_vts_providers_trade_license_expiry_date",
        "vts_providers",
        ["trade_license_expiry_date"],
    )
    op.create_index("ix_vts_providers_integration_status", "vts_providers", ["integration_status"])
    op.create_index(
        "ix_vts_providers_last_telemetry_received_at",
        "vts_providers",
        ["last_telemetry_received_at"],
    )

    add_columns(
        "vehicles",
        [
            sa.Column("usage_type", sa.String(40), nullable=True),
            sa.Column("body_type", sa.String(80), nullable=True),
            sa.Column("fuel_type", sa.String(40), nullable=True),
            sa.Column("registration_date", sa.Date(), nullable=True),
            sa.Column("registration_authority", sa.String(120), nullable=True),
            sa.Column("engine_capacity_cc", sa.Integer(), nullable=True),
            sa.Column("axle_count", sa.Integer(), nullable=True),
            sa.Column("gross_vehicle_weight_kg", sa.Float(), nullable=True),
            sa.Column("vehicle_photo_storage_key", sa.String(500), nullable=True),
            sa.Column("front_photo_storage_key", sa.String(500), nullable=True),
            sa.Column("back_photo_storage_key", sa.String(500), nullable=True),
            sa.Column("registration_certificate_storage_key", sa.String(500), nullable=True),
        ],
    )
    op.create_index("ix_vehicles_usage_type", "vehicles", ["usage_type"])
    op.create_index("ix_vehicles_body_type", "vehicles", ["body_type"])
    op.create_index("ix_vehicles_fuel_type", "vehicles", ["fuel_type"])
    op.create_index("ix_vehicles_registration_date", "vehicles", ["registration_date"])

    add_columns(
        "drivers",
        [
            sa.Column("employment_type", sa.String(60), nullable=True),
            sa.Column("shift_information", sa.Text(), nullable=True),
            sa.Column("medical_fitness_expiry_date", sa.Date(), nullable=True),
            sa.Column("suspension_reason", sa.Text(), nullable=True),
        ],
    )
    op.create_index("ix_drivers_employment_type", "drivers", ["employment_type"])
    op.create_index(
        "ix_drivers_medical_fitness_expiry_date",
        "drivers",
        ["medical_fitness_expiry_date"],
    )

    add_versioned_document_columns("vehicle_owner_documents")
    add_versioned_document_columns("vts_provider_documents")
    add_versioned_document_columns("driver_documents")

    with op.batch_alter_table("vehicle_documents") as batch_op:
        batch_op.add_column(sa.Column("storage_key", sa.String(500), nullable=True))
        batch_op.add_column(sa.Column("file_name", sa.String(255), nullable=True))
        batch_op.add_column(sa.Column("content_type", sa.String(120), nullable=True))
        batch_op.add_column(sa.Column("size_bytes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
        batch_op.add_column(
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(sa.Column("replaced_by_id", sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column("verified_by_user_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("review_notes", sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            "fk_vehicle_documents_replaced_by_id",
            "vehicle_documents",
            ["replaced_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_vehicle_documents_verified_by_user_id",
            "users",
            ["verified_by_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index("ix_vehicle_documents_storage_key", "vehicle_documents", ["storage_key"])
    op.create_index("ix_vehicle_documents_is_active", "vehicle_documents", ["is_active"])

    replace_tracking_device_identity_constraint()


def downgrade() -> None:
    with op.batch_alter_table("tracking_devices") as batch_op:
        batch_op.drop_constraint("uq_tracking_device_source_identifier", type_="unique")
        batch_op.create_unique_constraint(
            "uq_tracking_devices_device_identifier",
            ["device_identifier"],
        )

    op.drop_index("ix_vehicle_documents_is_active", table_name="vehicle_documents")
    op.drop_index("ix_vehicle_documents_storage_key", table_name="vehicle_documents")
    with op.batch_alter_table("vehicle_documents") as batch_op:
        batch_op.drop_constraint("fk_vehicle_documents_verified_by_user_id", type_="foreignkey")
        batch_op.drop_constraint("fk_vehicle_documents_replaced_by_id", type_="foreignkey")
        for column in [
            "review_notes",
            "verified_at",
            "verified_by_user_id",
            "replaced_by_id",
            "is_active",
            "version",
            "size_bytes",
            "content_type",
            "file_name",
            "storage_key",
        ]:
            batch_op.drop_column(column)

    for table in ["driver_documents", "vts_provider_documents", "vehicle_owner_documents"]:
        op.drop_index(f"ix_{table}_is_active", table_name=table)
        op.drop_index(f"ix_{table}_storage_key", table_name=table)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f"fk_{table}_replaced_by_id", type_="foreignkey")
            for column in [
                "replaced_by_id",
                "is_active",
                "version",
                "size_bytes",
                "content_type",
                "storage_key",
            ]:
                batch_op.drop_column(column)
            batch_op.alter_column("file_url", existing_type=sa.String(1000), nullable=False)

    op.drop_index("ix_drivers_medical_fitness_expiry_date", table_name="drivers")
    op.drop_index("ix_drivers_employment_type", table_name="drivers")
    with op.batch_alter_table("drivers") as batch_op:
        for column in [
            "suspension_reason",
            "medical_fitness_expiry_date",
            "shift_information",
            "employment_type",
        ]:
            batch_op.drop_column(column)

    op.drop_index("ix_vehicles_registration_date", table_name="vehicles")
    op.drop_index("ix_vehicles_fuel_type", table_name="vehicles")
    op.drop_index("ix_vehicles_body_type", table_name="vehicles")
    op.drop_index("ix_vehicles_usage_type", table_name="vehicles")
    with op.batch_alter_table("vehicles") as batch_op:
        for column in [
            "registration_certificate_storage_key",
            "back_photo_storage_key",
            "front_photo_storage_key",
            "vehicle_photo_storage_key",
            "gross_vehicle_weight_kg",
            "axle_count",
            "engine_capacity_cc",
            "registration_authority",
            "registration_date",
            "fuel_type",
            "body_type",
            "usage_type",
        ]:
            batch_op.drop_column(column)

    op.drop_index("ix_vts_providers_last_telemetry_received_at", table_name="vts_providers")
    op.drop_index("ix_vts_providers_integration_status", table_name="vts_providers")
    op.drop_index("ix_vts_providers_trade_license_expiry_date", table_name="vts_providers")
    op.drop_index("ix_vts_providers_btrc_license_expiry_date", table_name="vts_providers")
    with op.batch_alter_table("vts_providers") as batch_op:
        for column in [
            "last_telemetry_received_at",
            "integration_status",
            "supported_device_brands",
            "supported_protocols",
            "service_coverage",
            "emergency_contact_email",
            "emergency_contact_phone",
            "emergency_contact_name",
            "support_contact_email",
            "support_contact_phone",
            "support_contact_name",
            "operations_contact_email",
            "operations_contact_phone",
            "operations_contact_name",
            "authorized_representative_email",
            "authorized_representative_mobile",
            "authorized_representative_designation",
            "authorized_representative_nid",
            "authorized_representative_name",
            "trade_license_expiry_date",
            "btrc_license_expiry_date",
            "btrc_license_issue_date",
            "incorporation_date",
            "company_type",
        ]:
            batch_op.drop_column(column)

    op.drop_index("ix_vehicle_owners_upazila", table_name="vehicle_owners")
    op.drop_index("ix_vehicle_owners_division", table_name="vehicle_owners")
    with op.batch_alter_table("vehicle_owners") as batch_op:
        for column in [
            "operating_address",
            "head_office_address",
            "company_logo_storage_key",
            "authorized_person_email",
            "authorized_person_mobile",
            "authorized_person_designation",
            "authorized_person_nid",
            "authorized_person_name",
            "incorporation_date",
            "company_type",
            "alternate_phone",
            "postal_code",
            "upazila",
            "division",
            "permanent_address",
            "present_address",
            "profile_photo_storage_key",
            "gender",
            "mother_name",
            "father_name",
            "date_of_birth",
        ]:
            batch_op.drop_column(column)
