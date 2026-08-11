"""Initial backend registry and enforcement tables.

Revision ID: 0001_initial_backend
Revises:
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_backend"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

provider_status = sa.Enum(
    "PENDING", "APPROVED", "SUSPENDED", name="providerstatus", native_enum=False
)
entity_status = sa.Enum(
    "ACTIVE", "INACTIVE", "SUSPENDED", name="entitystatus", native_enum=False
)
assignment_status = sa.Enum("ACTIVE", "ENDED", name="assignmentstatus", native_enum=False)
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


def upgrade() -> None:
    op.create_table(
        "vts_providers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("license_number", sa.String(length=100), nullable=True),
        sa.Column("contact_person", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=180), nullable=True),
        sa.Column("status", provider_status, nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vts_providers")),
        sa.UniqueConstraint("code", name=op.f("uq_vts_providers_code")),
        sa.UniqueConstraint("name", name=op.f("uq_vts_providers_name")),
    )
    op.create_index(op.f("ix_vts_providers_code"), "vts_providers", ["code"])
    op.create_index(op.f("ix_vts_providers_status"), "vts_providers", ["status"])

    op.create_table(
        "vehicle_owners",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_type", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("nid_or_registration", sa.String(length=100), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=180), nullable=True),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("status", entity_status, nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_owners")),
        sa.UniqueConstraint(
            "nid_or_registration", name=op.f("uq_vehicle_owners_nid_or_registration")
        ),
    )
    op.create_index(op.f("ix_vehicle_owners_name"), "vehicle_owners", ["name"])
    op.create_index(op.f("ix_vehicle_owners_status"), "vehicle_owners", ["status"])

    op.create_table(
        "drivers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("licence_number", sa.String(length=100), nullable=False),
        sa.Column("licence_expiry", sa.Date(), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("nid_reference", sa.String(length=100), nullable=True),
        sa.Column("photo_url", sa.String(length=500), nullable=True),
        sa.Column("behaviour_score", sa.Float(), nullable=False),
        sa.Column("status", entity_status, nullable=False),
        *timestamp_columns(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_drivers")),
        sa.UniqueConstraint("licence_number", name=op.f("uq_drivers_licence_number")),
        sa.UniqueConstraint("nid_reference", name=op.f("uq_drivers_nid_reference")),
    )
    op.create_index(op.f("ix_drivers_licence_number"), "drivers", ["licence_number"])
    op.create_index(op.f("ix_drivers_name"), "drivers", ["name"])
    op.create_index(op.f("ix_drivers_status"), "drivers", ["status"])

    op.create_table(
        "vehicles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("registration_number", sa.String(length=80), nullable=False),
        sa.Column("chassis_number", sa.String(length=120), nullable=False),
        sa.Column("engine_number", sa.String(length=120), nullable=True),
        sa.Column("vehicle_type", sa.String(length=60), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.String(length=120), nullable=False),
        sa.Column("default_speed_limit_kph", sa.Float(), nullable=False),
        sa.Column("latest_latitude", sa.Float(), nullable=True),
        sa.Column("latest_longitude", sa.Float(), nullable=True),
        sa.Column("latest_speed_kph", sa.Float(), nullable=True),
        sa.Column("last_recorded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", entity_status, nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["vehicle_owners.id"], name=op.f("fk_vehicles_owner_id_vehicle_owners")
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["vts_providers.id"],
            name=op.f("fk_vehicles_provider_id_vts_providers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicles")),
        sa.UniqueConstraint("chassis_number", name=op.f("uq_vehicles_chassis_number")),
        sa.UniqueConstraint("device_id", name=op.f("uq_vehicles_device_id")),
        sa.UniqueConstraint(
            "registration_number", name=op.f("uq_vehicles_registration_number")
        ),
    )
    vehicle_indexes = [
        "device_id",
        "owner_id",
        "provider_id",
        "registration_number",
        "status",
        "vehicle_type",
    ]
    for column in vehicle_indexes:
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
        sa.ForeignKeyConstraint(
            ["driver_id"], ["drivers.id"], name=op.f("fk_driver_assignments_driver_id_drivers")
        ),
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            ondelete="CASCADE",
            name=op.f("fk_driver_assignments_vehicle_id_vehicles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_driver_assignments")),
    )
    for column in ["driver_id", "status", "vehicle_id"]:
        op.create_index(op.f(f"ix_driver_assignments_{column}"), "driver_assignments", [column])

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
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            ondelete="CASCADE",
            name=op.f("fk_vehicle_documents_vehicle_id_vehicles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_documents")),
    )
    for column in ["document_type", "expires_at", "status", "vehicle_id"]:
        op.create_index(op.f(f"ix_vehicle_documents_{column}"), "vehicle_documents", [column])

    op.create_table(
        "vehicle_qr_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=False),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            ondelete="CASCADE",
            name=op.f("fk_vehicle_qr_tokens_vehicle_id_vehicles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vehicle_qr_tokens")),
        sa.UniqueConstraint("token", name=op.f("uq_vehicle_qr_tokens_token")),
        sa.UniqueConstraint("vehicle_id", name=op.f("uq_vehicle_qr_tokens_vehicle_id")),
    )
    for column in ["is_active", "token", "vehicle_id"]:
        op.create_index(op.f(f"ix_vehicle_qr_tokens_{column}"), "vehicle_qr_tokens", [column])

    op.create_table(
        "telemetry_points",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["vts_providers.id"],
            name=op.f("fk_telemetry_points_provider_id_vts_providers"),
        ),
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            ondelete="CASCADE",
            name=op.f("fk_telemetry_points_vehicle_id_vehicles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_telemetry_points")),
        sa.UniqueConstraint(
            "external_event_id", name=op.f("uq_telemetry_points_external_event_id")
        ),
    )
    for column in ["external_event_id", "provider_id", "recorded_at", "vehicle_id"]:
        op.create_index(op.f(f"ix_telemetry_points_{column}"), "telemetry_points", [column])

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
        sa.ForeignKeyConstraint(
            ["driver_id"],
            ["drivers.id"],
            ondelete="SET NULL",
            name=op.f("fk_violation_candidates_driver_id_drivers"),
        ),
        sa.ForeignKeyConstraint(
            ["telemetry_id"],
            ["telemetry_points.id"],
            ondelete="CASCADE",
            name=op.f("fk_violation_candidates_telemetry_id_telemetry_points"),
        ),
        sa.ForeignKeyConstraint(
            ["vehicle_id"],
            ["vehicles.id"],
            ondelete="CASCADE",
            name=op.f("fk_violation_candidates_vehicle_id_vehicles"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_violation_candidates")),
        sa.UniqueConstraint("case_number", name=op.f("uq_violation_candidates_case_number")),
        sa.UniqueConstraint(
            "telemetry_id", name=op.f("uq_violation_candidates_telemetry_id")
        ),
    )
    for column in ["detected_at", "driver_id", "status", "vehicle_id", "violation_type"]:
        op.create_index(op.f(f"ix_violation_candidates_{column}"), "violation_candidates", [column])


def downgrade() -> None:
    op.drop_table("violation_candidates")
    op.drop_table("telemetry_points")
    op.drop_table("vehicle_qr_tokens")
    op.drop_table("vehicle_documents")
    op.drop_table("driver_assignments")
    op.drop_table("vehicles")
    op.drop_table("drivers")
    op.drop_table("vehicle_owners")
    op.drop_table("vts_providers")
