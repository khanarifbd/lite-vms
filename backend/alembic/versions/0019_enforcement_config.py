"""Add enforcement configuration foundation.

Revision ID: 0019_enforcement_config
Revises: 0018_vehicle_move_state
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_enforcement_config"
down_revision: str | None = "0018_vehicle_move_state"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "enforcement_policies",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("violation_type", sa.String(length=40), nullable=False),
        sa.Column("scope", sa.String(length=30), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("minimum_duration_seconds", sa.Integer(), nullable=False),
        sa.Column("minimum_consecutive_packets", sa.Integer(), nullable=False),
        sa.Column("cooldown_seconds", sa.Integer(), nullable=False),
        sa.Column("acceptable_packet_delay_seconds", sa.Integer(), nullable=False),
        sa.Column("review_required", sa.Boolean(), nullable=False),
        sa.Column("auto_create_candidate", sa.Boolean(), nullable=False),
        sa.Column("auto_create_case", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("legal_reference", sa.String(length=240), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_enforcement_policies_enabled", "enforcement_policies", ["enabled"])
    op.create_index("ix_enforcement_policies_scope", "enforcement_policies", ["scope"])
    op.create_index("ix_enforcement_policies_severity", "enforcement_policies", ["severity"])
    op.create_index("ix_enforcement_policies_violation_type", "enforcement_policies", ["violation_type"])

    op.create_table(
        "enforcement_jurisdictions",
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("area_type", sa.String(length=30), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.create_index("ix_enforcement_jurisdictions_area_type", "enforcement_jurisdictions", ["area_type"])
    op.create_index("ix_enforcement_jurisdictions_enabled", "enforcement_jurisdictions", ["enabled"])
    op.create_index("ix_enforcement_jurisdictions_priority", "enforcement_jurisdictions", ["priority"])

    op.create_table(
        "speed_rules",
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("policy_id", sa.Uuid(), nullable=False),
        sa.Column("jurisdiction_id", sa.Uuid(), nullable=True),
        sa.Column("area_type", sa.String(length=30), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=True),
        sa.Column("maximum_speed_kph", sa.Float(), nullable=False),
        sa.Column("tolerance_kph", sa.Float(), nullable=False),
        sa.Column("vehicle_categories", sa.JSON(), nullable=True),
        sa.Column("active_days", sa.JSON(), nullable=True),
        sa.Column("active_start_time", sa.String(length=5), nullable=True),
        sa.Column("active_end_time", sa.String(length=5), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("effective_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["jurisdiction_id"], ["enforcement_jurisdictions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["policy_id"], ["enforcement_policies.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_speed_rules_area_type", "speed_rules", ["area_type"])
    op.create_index("ix_speed_rules_enabled", "speed_rules", ["enabled"])
    op.create_index("ix_speed_rules_jurisdiction_id", "speed_rules", ["jurisdiction_id"])
    op.create_index("ix_speed_rules_policy_id", "speed_rules", ["policy_id"])
    op.create_index("ix_speed_rules_priority", "speed_rules", ["priority"])

    op.create_table(
        "vehicle_enforcement_exemptions",
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("violation_type", sa.String(length=40), nullable=True),
        sa.Column("reason", sa.String(length=40), nullable=False),
        sa.Column("reference_number", sa.String(length=120), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("approved_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicle_enforcement_exemptions_enabled", "vehicle_enforcement_exemptions", ["enabled"])
    op.create_index("ix_vehicle_enforcement_exemptions_reason", "vehicle_enforcement_exemptions", ["reason"])
    op.create_index("ix_vehicle_enforcement_exemptions_reference_number", "vehicle_enforcement_exemptions", ["reference_number"])
    op.create_index("ix_vehicle_enforcement_exemptions_valid_from", "vehicle_enforcement_exemptions", ["valid_from"])
    op.create_index("ix_vehicle_enforcement_exemptions_valid_to", "vehicle_enforcement_exemptions", ["valid_to"])
    op.create_index("ix_vehicle_enforcement_exemptions_vehicle_id", "vehicle_enforcement_exemptions", ["vehicle_id"])
    op.create_index("ix_vehicle_enforcement_exemptions_violation_type", "vehicle_enforcement_exemptions", ["violation_type"])


def downgrade() -> None:
    op.drop_table("vehicle_enforcement_exemptions")
    op.drop_table("speed_rules")
    op.drop_table("enforcement_jurisdictions")
    op.drop_table("enforcement_policies")
