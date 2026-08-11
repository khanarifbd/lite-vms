"""Add unified vehicle-owner and GPS tracking architecture.

Revision ID: 0005_vehicle_owner_tracking
Revises: 0004_unified_vts_registration
Create Date: 2026-07-26

This development-stage migration resets the owner/vehicle/tracking/telemetry domain.
Identity, tenancy, organization, role, user, and VTS-provider records remain intact.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_vehicle_owner_tracking"
down_revision: str | None = "0004_unified_vts_registration"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")

owner_type = sa.Enum(
    "INDIVIDUAL", "COMPANY", name="ownertype", native_enum=False
)
owner_verification_status = sa.Enum(
    "PENDING",
    "UNDER_REVIEW",
    "APPROVED",
    "CHANGES_REQUESTED",
    "REJECTED",
    "SUSPENDED",
    name="ownerverificationstatus",
    native_enum=False,
)
owner_document_type = sa.Enum(
    "NATIONAL_ID",
    "PASSPORT",
    "COMPANY_REGISTRATION",
    "TRADE_LICENSE",
    "TIN_CERTIFICATE",
    "BIN_CERTIFICATE",
    "AUTHORIZED_PERSON_ID",
    "OTHER",
    name="ownerdocumenttype",
    native_enum=False,
)
owner_document_status = sa.Enum(
    "PENDING", "VERIFIED", "REJECTED", name="ownerdocumentstatus", native_enum=False
)
vehicle_verification_status = sa.Enum(
    "PENDING_VERIFICATION",
    "UNDER_REVIEW",
    "VERIFIED",
    "CHANGES_REQUESTED",
    "REJECTED",
    "SUSPENDED",
    "DECOMMISSIONED",
    name="vehicleverificationstatus",
    native_enum=False,
)
telemetry_source_type = sa.Enum(
    "VTS_PROVIDER", "OWNER_MANAGED", name="telemetrysourcetype", native_enum=False
)
telemetry_source_status = sa.Enum(
    "PENDING",
    "TESTING",
    "ACTIVE",
    "SUSPENDED",
    "REJECTED",
    name="telemetrysourcestatus",
    native_enum=False,
)
device_ownership_type = sa.Enum(
    "PROVIDER_OWNED", "OWNER_OWNED", "LEASED", name="deviceownershiptype", native_enum=False
)
device_certification_status = sa.Enum(
    "PENDING",
    "TESTING",
    "APPROVED",
    "REJECTED",
    "SUSPENDED",
    name="devicecertificationstatus",
    native_enum=False,
)
device_operational_status = sa.Enum(
    "PENDING",
    "ACTIVE",
    "SUSPENDED",
    "RETIRED",
    name="deviceoperationalstatus",
    native_enum=False,
)
tracking_assignment_status = sa.Enum(
    "PENDING_PROVIDER_CONFIRMATION",
    "TESTING",
    "ACTIVE",
    "ENDED",
    "REJECTED",
    name="trackingassignmentstatus",
    native_enum=False,
)
entity_status = sa.Enum(
    "ACTIVE", "INACTIVE", "SUSPENDED", name="entitystatus", native_enum=False
)
assignment_status = sa.Enum(
    "ACTIVE", "ENDED", name="assignmentstatus", native_enum=False
)
document_type = sa.Enum(
    "REGISTRATION",
    "TAX_TOKEN",
    "FITNESS",
    "ROUTE_PERMIT",
    "INSURANCE",
    name="documenttype",
    native_enum=False,
)
document_status = sa.Enum(
    "VALID",
    "EXPIRED",
    "PENDING_VERIFICATION",
    "REVOKED",
    name="documentstatus",
    native_enum=False,
)
violation_type = sa.Enum(
    "OVERSPEED",
    "ROUTE_VIOLATION",
    "GEOFENCE_VIOLATION",
    "DOCUMENT_EXPIRED",
    name="violationtype",
    native_enum=False,
)
violation_status = sa.Enum(
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "MORE_INFORMATION_REQUIRED",
    name="violationstatus",
    native_enum=False,
)


def timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def drop_legacy_vehicle_domain() -> None:
    op.drop_table("violation_candidates")
    op.drop_table("telemetry_points")
    op.drop_table("vehicle_qr_tokens")
    op.drop_table("vehicle_documents")
    op.drop_table("driver_assignments")
    op.drop_table("vehicles")
    op.drop_table("vehicle_owners")


def create_owner_tables() -> None:
    op.create_table(
        "vehicle_owners",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", bigint_pk, nullable=True),
        sa.Column("root_organization_id", bigint_pk, nullable=True),
        sa.Column("primary_admin_user_id", bigint_pk, nullable=True),
        sa.Column("application_number", sa.String(length=40), nullable=True),
        sa.Column("owner_code", sa.String(length=40), nullable=True),
        sa.Column("owner_type", owner_type, nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("nid_or_registration", sa.String(length=120), nullable=True),
        sa.Column("trade_license_number", sa.String(length=120), nullable=True),
        sa.Column("tin_number", sa.String(length=80), nullable=True),
        sa.Column("bin_number", sa.String(length=80), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=180), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("district", sa.String(length=100), nullable=True),
        sa.Column("website_url", sa.String(length=500), nullable=True),
        sa.Column("declaration_accepted", sa.Boolean(), nullable=False),
        sa.Column("declaration_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_id", bigint_pk, nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("verification_status", owner_verification_status, nullable=False),
        sa.Column("status", entity_status, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["root_organization_id"], ["organizations.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["primary_admin_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_owners")),
        sa.UniqueConstraint("tenant_id", name=op.f("uq_vehicle_owners_tenant_id")),
        sa.UniqueConstraint(
            "root_organization_id", name=op.f("uq_vehicle_owners_root_organization_id")
        ),
        sa.UniqueConstraint(
            "application_number", name=op.f("uq_vehicle_owners_application_number")
        ),
        sa.UniqueConstraint("owner_code", name=op.f("uq_vehicle_owners_owner_code")),
        sa.UniqueConstraint(
            "nid_or_registration", name=op.f("uq_vehicle_owners_nid_or_registration")
        ),
    )
    for column in (
        "tenant_id",
        "root_organization_id",
        "primary_admin_user_id",
        "application_number",
        "owner_code",
        "owner_type",
        "name",
        "nid_or_registration",
        "trade_license_number",
        "tin_number",
        "bin_number",
        "district",
        "reviewed_by_id",
        "verification_status",
        "status",
    ):
        op.create_index(op.f(f"ix_vehicle_owners_{column}"), "vehicle_owners", [column])

    op.create_table(
        "vehicle_owner_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", owner_document_type, nullable=False),
        sa.Column("document_reference", sa.String(length=160), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", owner_document_status, nullable=False),
        sa.Column("verified_by_id", bigint_pk, nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["verified_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_owner_documents")),
    )
    for column in ("owner_id", "document_type", "status"):
        op.create_index(
            op.f(f"ix_vehicle_owner_documents_{column}"),
            "vehicle_owner_documents",
            [column],
        )


def create_vehicle_tables() -> None:
    op.create_table(
        "vehicles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("registration_number", sa.String(length=80), nullable=False),
        sa.Column("chassis_number", sa.String(length=120), nullable=False),
        sa.Column("engine_number", sa.String(length=120), nullable=True),
        sa.Column("vehicle_type", sa.String(length=60), nullable=False),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("manufacturing_year", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=60), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("submitted_by_user_id", bigint_pk, nullable=True),
        sa.Column("reviewed_by_user_id", bigint_pk, nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("verification_status", vehicle_verification_status, nullable=False),
        sa.Column("default_speed_limit_kph", sa.Float(), nullable=False),
        sa.Column("latest_latitude", sa.Float(), nullable=True),
        sa.Column("latest_longitude", sa.Float(), nullable=True),
        sa.Column("latest_speed_kph", sa.Float(), nullable=True),
        sa.Column("last_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", entity_status, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicles")),
        sa.UniqueConstraint("registration_number", name=op.f("uq_vehicles_registration_number")),
        sa.UniqueConstraint("chassis_number", name=op.f("uq_vehicles_chassis_number")),
    )
    for column in (
        "registration_number",
        "vehicle_type",
        "owner_id",
        "submitted_by_user_id",
        "reviewed_by_user_id",
        "verification_status",
        "status",
    ):
        op.create_index(op.f(f"ix_vehicles_{column}"), "vehicles", [column])

    op.create_table(
        "driver_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by_actor", sa.String(length=120), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", assignment_status, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_driver_assignments")),
    )
    for column in ("driver_id", "status", "vehicle_id"):
        op.create_index(
            op.f(f"ix_driver_assignments_{column}"), "driver_assignments", [column]
        )

    op.create_table(
        "vehicle_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", document_type, nullable=False),
        sa.Column("document_number", sa.String(length=120), nullable=True),
        sa.Column("issued_at", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("status", document_status, nullable=False),
        sa.Column("source", sa.String(length=60), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_documents")),
    )
    for column in ("document_type", "expires_at", "status", "vehicle_id"):
        op.create_index(
            op.f(f"ix_vehicle_documents_{column}"), "vehicle_documents", [column]
        )

    op.create_table(
        "vehicle_qr_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_qr_tokens")),
        sa.UniqueConstraint("token", name=op.f("uq_vehicle_qr_tokens_token")),
        sa.UniqueConstraint("vehicle_id", name=op.f("uq_vehicle_qr_tokens_vehicle_id")),
    )
    for column in ("is_active", "token", "vehicle_id"):
        op.create_index(
            op.f(f"ix_vehicle_qr_tokens_{column}"), "vehicle_qr_tokens", [column]
        )


def create_tracking_tables() -> None:
    op.create_table(
        "telemetry_sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=60), nullable=False),
        sa.Column("source_type", telemetry_source_type, nullable=False),
        sa.Column("tenant_id", bigint_pk, nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("status", telemetry_source_status, nullable=False),
        sa.Column("approved_by_id", bigint_pk, nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status_reason", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["vts_providers.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_telemetry_sources")),
        sa.UniqueConstraint("code", name=op.f("uq_telemetry_sources_code")),
        sa.UniqueConstraint("provider_id", name=op.f("uq_telemetry_sources_provider_id")),
        sa.UniqueConstraint("owner_id", name=op.f("uq_telemetry_sources_owner_id")),
    )
    for column in (
        "code",
        "source_type",
        "tenant_id",
        "provider_id",
        "owner_id",
        "status",
    ):
        op.create_index(
            op.f(f"ix_telemetry_sources_{column}"), "telemetry_sources", [column]
        )

    op.create_table(
        "tracking_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("device_identifier", sa.String(length=160), nullable=False),
        sa.Column("imei", sa.String(length=32), nullable=True),
        sa.Column("manufacturer", sa.String(length=120), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("protocol", sa.String(length=100), nullable=True),
        sa.Column("firmware_version", sa.String(length=100), nullable=True),
        sa.Column("sim_number", sa.String(length=30), nullable=True),
        sa.Column("data_frequency_seconds", sa.Integer(), nullable=True),
        sa.Column("ownership_type", device_ownership_type, nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("provider_id", sa.Uuid(), nullable=True),
        sa.Column("certification_status", device_certification_status, nullable=False),
        sa.Column("operational_status", device_operational_status, nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_test_latitude", sa.Float(), nullable=True),
        sa.Column("last_test_longitude", sa.Float(), nullable=True),
        sa.Column("last_test_payload", sa.JSON(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["source_id"], ["telemetry_sources.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["vts_providers.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tracking_devices")),
        sa.UniqueConstraint(
            "device_identifier", name=op.f("uq_tracking_devices_device_identifier")
        ),
        sa.UniqueConstraint("imei", name=op.f("uq_tracking_devices_imei")),
    )
    for column in (
        "source_id",
        "device_identifier",
        "imei",
        "protocol",
        "ownership_type",
        "owner_id",
        "provider_id",
        "certification_status",
        "operational_status",
    ):
        op.create_index(
            op.f(f"ix_tracking_devices_{column}"), "tracking_devices", [column]
        )

    op.create_table(
        "vehicle_device_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("account_reference", sa.String(length=160), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", tracking_assignment_status, nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("submitted_by_user_id", bigint_pk, nullable=False),
        sa.Column("provider_confirmed_by_user_id", bigint_pk, nullable=True),
        sa.Column("provider_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by_user_id", bigint_pk, nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["device_id"], ["tracking_devices.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_id"], ["telemetry_sources.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"], ["vts_providers.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["provider_confirmed_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["approved_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_device_assignments")),
        sa.UniqueConstraint(
            "vehicle_id", "device_id", "valid_from", name="uq_vehicle_device_period"
        ),
    )
    for column in (
        "vehicle_id",
        "device_id",
        "source_id",
        "provider_id",
        "owner_id",
        "valid_from",
        "status",
        "is_primary",
        "submitted_by_user_id",
    ):
        op.create_index(
            op.f(f"ix_vehicle_device_assignments_{column}"),
            "vehicle_device_assignments",
            [column],
        )


def create_telemetry_and_violation_tables() -> None:
    op.create_table(
        "telemetry_points",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("external_event_id", sa.String(length=160), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("speed_kph", sa.Float(), nullable=False),
        sa.Column("heading", sa.Float(), nullable=True),
        sa.Column("ignition", sa.Boolean(), nullable=True),
        sa.Column("gps_accuracy_m", sa.Float(), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_id"], ["telemetry_sources.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["device_id"], ["tracking_devices.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"], ["vehicle_device_assignments.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_telemetry_points")),
        sa.UniqueConstraint(
            "source_id",
            "external_event_id",
            name="uq_telemetry_source_external_event",
        ),
    )
    for column in (
        "vehicle_id",
        "source_id",
        "device_id",
        "assignment_id",
        "external_event_id",
        "recorded_at",
    ):
        op.create_index(
            op.f(f"ix_telemetry_points_{column}"), "telemetry_points", [column]
        )

    op.create_table(
        "violation_candidates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=True),
        sa.Column("telemetry_id", sa.Uuid(), nullable=False),
        sa.Column("violation_type", violation_type, nullable=False),
        sa.Column("status", violation_status, nullable=False),
        sa.Column("detected_value", sa.Float(), nullable=True),
        sa.Column("allowed_value", sa.Float(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_officer_id", sa.String(length=120), nullable=True),
        sa.Column("reviewed_by", sa.String(length=120), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("case_number", sa.String(length=80), nullable=True),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["telemetry_id"], ["telemetry_points.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_violation_candidates")),
        sa.UniqueConstraint("case_number", name=op.f("uq_violation_candidates_case_number")),
        sa.UniqueConstraint("telemetry_id", name=op.f("uq_violation_candidates_telemetry_id")),
    )
    for column in (
        "detected_at",
        "driver_id",
        "status",
        "vehicle_id",
        "violation_type",
    ):
        op.create_index(
            op.f(f"ix_violation_candidates_{column}"),
            "violation_candidates",
            [column],
        )


def upgrade() -> None:
    drop_legacy_vehicle_domain()
    create_owner_tables()
    create_vehicle_tables()
    create_tracking_tables()
    create_telemetry_and_violation_tables()


def downgrade() -> None:
    raise RuntimeError(
        "0005 is an irreversible development-domain reset; restore from backup "
        "or rebuild the owner/vehicle domain instead of downgrading"
    )
