"""Rebuild the development driver domain as a global registry.

Revision ID: 0010_global_driver_registry
Revises: 0009_user_identifier_management
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_global_driver_registry"
down_revision: str | None = "0009_user_identifier_management"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
entity_status = sa.Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="entitystatus", native_enum=False)
driver_claim_status = sa.Enum(
    "PENDING_CLAIM", "CLAIMED", name="driverclaimstatus", native_enum=False
)
driver_verification_status = sa.Enum(
    "PENDING",
    "UNDER_REVIEW",
    "VERIFIED",
    "CHANGES_REQUESTED",
    "REJECTED",
    "SUSPENDED",
    name="driververificationstatus",
    native_enum=False,
)
driver_licence_type = sa.Enum(
    "PROFESSIONAL",
    "NON_PROFESSIONAL",
    "LEARNER",
    name="driverlicencetype",
    native_enum=False,
)
driver_licence_status = sa.Enum(
    "PENDING",
    "VERIFIED",
    "EXPIRED",
    "SUSPENDED",
    "REVOKED",
    "REJECTED",
    name="driverlicencestatus",
    native_enum=False,
)
driver_document_type = sa.Enum(
    "NATIONAL_ID_FRONT",
    "NATIONAL_ID_BACK",
    "DRIVING_LICENCE_FRONT",
    "DRIVING_LICENCE_BACK",
    "DRIVER_PHOTO",
    "MEDICAL_CERTIFICATE",
    "POLICE_CLEARANCE",
    "OTHER",
    name="driverdocumenttype",
    native_enum=False,
)
driver_document_status = sa.Enum(
    "PENDING", "VERIFIED", "REJECTED", name="driverdocumentstatus", native_enum=False
)
driver_link_status = sa.Enum(
    "PENDING_DRIVER_APPROVAL",
    "PENDING_ORGANIZATION_APPROVAL",
    "ACTIVE",
    "REJECTED",
    "SUSPENDED",
    "ENDED",
    name="driverlinkstatus",
    native_enum=False,
)
driver_link_source = sa.Enum(
    "DRIVER",
    "VTS_PROVIDER",
    "VEHICLE_OWNER",
    name="driverlinksource",
    native_enum=False,
)
driver_assignment_status = sa.Enum(
    "PENDING",
    "ACTIVE",
    "ENDED",
    "SUSPENDED",
    "REJECTED",
    name="driverassignmentstatus",
    native_enum=False,
)


def detach_legacy_violation_driver_reference() -> None:
    """Remove the legacy integer driver FK before rebuilding the driver table.

    Existing violation rows are preserved. Their obsolete legacy driver link is
    intentionally cleared and a nullable UUID relationship is recreated after
    the national driver registry exists.
    """
    with op.batch_alter_table("violation_candidates") as batch_op:
        batch_op.drop_constraint(
            "fk_violation_candidates_driver_id_drivers",
            type_="foreignkey",
        )
        batch_op.drop_index("ix_violation_candidates_driver_id")
        batch_op.drop_column("driver_id")


def attach_global_violation_driver_reference() -> None:
    with op.batch_alter_table("violation_candidates") as batch_op:
        batch_op.add_column(sa.Column("driver_id", sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            "fk_violation_candidates_driver_id_drivers",
            "drivers",
            ["driver_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_violation_candidates_driver_id", ["driver_id"])


def upgrade() -> None:
    detach_legacy_violation_driver_reference()
    op.drop_table("driver_assignments")
    op.drop_table("drivers")

    op.create_table(
        "drivers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("driver_code", sa.String(length=40), nullable=False),
        sa.Column("nid_reference", sa.String(length=120), nullable=False),
        sa.Column("full_name", sa.String(length=180), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("father_name", sa.String(length=180), nullable=True),
        sa.Column("mother_name", sa.String(length=180), nullable=True),
        sa.Column("gender", sa.String(length=30), nullable=True),
        sa.Column("blood_group", sa.String(length=10), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("email", sa.String(length=180), nullable=False),
        sa.Column("emergency_contact_name", sa.String(length=180), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(length=30), nullable=True),
        sa.Column("present_address", sa.Text(), nullable=False),
        sa.Column("permanent_address", sa.Text(), nullable=True),
        sa.Column("district", sa.String(length=100), nullable=False),
        sa.Column("photo_url", sa.String(length=1000), nullable=True),
        sa.Column("claim_status", driver_claim_status, nullable=False),
        sa.Column("verification_status", driver_verification_status, nullable=False),
        sa.Column("behaviour_score", sa.Float(), nullable=False),
        sa.Column("declaration_accepted", sa.Boolean(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_by_user_id", bigint_pk, nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_by_provider_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_owner_id", sa.Uuid(), nullable=True),
        sa.Column("status", entity_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["created_by_provider_id"], ["vts_providers.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["created_by_owner_id"], ["vehicle_owners.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        sa.UniqueConstraint("driver_code"),
        sa.UniqueConstraint("nid_reference"),
    )
    for column in (
        "user_id",
        "driver_code",
        "nid_reference",
        "full_name",
        "phone",
        "email",
        "district",
        "claim_status",
        "verification_status",
        "reviewed_by_user_id",
        "created_by_provider_id",
        "created_by_owner_id",
        "status",
    ):
        op.create_index(op.f(f"ix_drivers_{column}"), "drivers", [column])

    attach_global_violation_driver_reference()

    op.create_table(
        "driver_licences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("licence_number", sa.String(length=100), nullable=False),
        sa.Column("licence_type", driver_licence_type, nullable=False),
        sa.Column("vehicle_classes", sa.JSON(), nullable=False),
        sa.Column("first_issue_date", sa.Date(), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("issuing_authority", sa.String(length=80), nullable=False),
        sa.Column("verification_status", driver_licence_status, nullable=False),
        sa.Column("verified_by_user_id", bigint_pk, nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("driver_id"),
        sa.UniqueConstraint("licence_number"),
    )
    op.create_index(op.f("ix_driver_licences_driver_id"), "driver_licences", ["driver_id"])
    op.create_index(
        op.f("ix_driver_licences_licence_number"), "driver_licences", ["licence_number"]
    )
    op.create_index(op.f("ix_driver_licences_expiry_date"), "driver_licences", ["expiry_date"])
    op.create_index(
        op.f("ix_driver_licences_verification_status"),
        "driver_licences",
        ["verification_status"],
    )

    op.create_table(
        "driver_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("document_type", driver_document_type, nullable=False),
        sa.Column("document_reference", sa.String(length=160), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("file_url", sa.String(length=1000), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", driver_document_status, nullable=False),
        sa.Column("verified_by_user_id", bigint_pk, nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_driver_documents_driver_id"), "driver_documents", ["driver_id"])
    op.create_index(
        op.f("ix_driver_documents_document_type"), "driver_documents", ["document_type"]
    )
    op.create_index(op.f("ix_driver_documents_status"), "driver_documents", ["status"])

    for table_name, organization_column, organization_table in (
        ("vts_provider_driver_links", "provider_id", "vts_providers"),
        ("vehicle_owner_driver_links", "owner_id", "vehicle_owners"),
    ):
        op.create_table(
            table_name,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column(organization_column, sa.Uuid(), nullable=False),
            sa.Column("driver_id", sa.Uuid(), nullable=False),
            sa.Column("status", driver_link_status, nullable=False),
            sa.Column("requested_by", driver_link_source, nullable=False),
            sa.Column("requested_by_user_id", bigint_pk, nullable=False),
            sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("responded_by_user_id", bigint_pk, nullable=True),
            sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                [organization_column], [f"{organization_table}.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["requested_by_user_id"], ["users.id"], ondelete="RESTRICT"
            ),
            sa.ForeignKeyConstraint(
                ["responded_by_user_id"], ["users.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                organization_column,
                "driver_id",
                name=f"uq_{table_name.removesuffix('s')}",
            ),
        )
        op.create_index(
            op.f(f"ix_{table_name}_{organization_column}"), table_name, [organization_column]
        )
        op.create_index(op.f(f"ix_{table_name}_driver_id"), table_name, ["driver_id"])
        op.create_index(op.f(f"ix_{table_name}_status"), table_name, ["status"])
        op.create_index(op.f(f"ix_{table_name}_requested_by"), table_name, ["requested_by"])
        op.create_index(
            op.f(f"ix_{table_name}_requested_by_user_id"),
            table_name,
            ["requested_by_user_id"],
        )

    op.create_table(
        "driver_mobile_password_reset_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("normalized_mobile", sa.String(length=30), nullable=False),
        sa.Column("otp_digest", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("driver_id", "user_id", "normalized_mobile", "expires_at"):
        op.create_index(
            op.f(f"ix_driver_mobile_password_reset_challenges_{column}"),
            "driver_mobile_password_reset_challenges",
            [column],
        )

    op.create_table(
        "driver_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("provider_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_by_user_id", bigint_pk, nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", driver_assignment_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_id"], ["vehicle_owners.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["provider_id"], ["vts_providers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "vehicle_id",
        "driver_id",
        "owner_id",
        "provider_id",
        "assigned_by_user_id",
        "status",
    ):
        op.create_index(op.f(f"ix_driver_assignments_{column}"), "driver_assignments", [column])


def downgrade() -> None:
    raise NotImplementedError(
        "0010 rebuilds the development driver domain and is intentionally irreversible"
    )
