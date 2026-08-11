"""add geofence and case workflow

Revision ID: 0022_enforcement_case_flow
Revises: 0021_speed_rule_review_org
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_enforcement_case_flow"
down_revision = "0021_speed_rule_review_org"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enforcement_geofences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("geometry", sa.JSON(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_enforcement_geofences_name", "enforcement_geofences", ["name"], unique=True)
    op.create_index("ix_enforcement_geofences_enabled", "enforcement_geofences", ["enabled"], unique=False)
    op.create_index("ix_enforcement_geofences_created_by_user_id", "enforcement_geofences", ["created_by_user_id"], unique=False)

    op.add_column("speed_rules", sa.Column("geofence_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_speed_rules_geofence_id_enforcement_geofences",
        "speed_rules",
        "enforcement_geofences",
        ["geofence_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_speed_rules_geofence_id", "speed_rules", ["geofence_id"], unique=False)

    # Reuse and extend the existing violation_candidates table so historical
    # detection evidence and review records remain intact.
    op.add_column("violation_candidates", sa.Column("rule_id", sa.Uuid(), nullable=True))
    op.add_column("violation_candidates", sa.Column("policy_id", sa.Uuid(), nullable=True))
    op.add_column("violation_candidates", sa.Column("review_organization_id", sa.BigInteger(), nullable=True))
    op.add_column("violation_candidates", sa.Column("evidence", sa.JSON(), nullable=True))
    op.add_column("violation_candidates", sa.Column("reviewed_by_user_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_violation_candidates_rule_id_speed_rules", "violation_candidates", "speed_rules", ["rule_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_violation_candidates_policy_id_enforcement_policies", "violation_candidates", "enforcement_policies", ["policy_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_violation_candidates_review_org_organizations", "violation_candidates", "organizations", ["review_organization_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_violation_candidates_reviewed_user_users", "violation_candidates", "users", ["reviewed_by_user_id"], ["id"], ondelete="SET NULL")
    for column in ["rule_id", "policy_id", "review_organization_id", "reviewed_by_user_id"]:
        op.create_index(f"ix_violation_candidates_{column}", "violation_candidates", [column], unique=False)

    op.create_table(
        "enforcement_cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_number", sa.String(length=80), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("opened_by_user_id", sa.BigInteger(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["violation_candidates.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["opened_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_number"),
        sa.UniqueConstraint("candidate_id"),
    )
    op.create_index("ix_enforcement_cases_case_number", "enforcement_cases", ["case_number"], unique=True)
    op.create_index("ix_enforcement_cases_candidate_id", "enforcement_cases", ["candidate_id"], unique=True)
    op.create_index("ix_enforcement_cases_organization_id", "enforcement_cases", ["organization_id"], unique=False)
    op.create_index("ix_enforcement_cases_status", "enforcement_cases", ["status"], unique=False)
    op.create_index("ix_enforcement_cases_opened_by_user_id", "enforcement_cases", ["opened_by_user_id"], unique=False)
    op.create_index("ix_enforcement_cases_opened_at", "enforcement_cases", ["opened_at"], unique=False)


def downgrade() -> None:
    op.drop_table("enforcement_cases")
    for column in ["reviewed_by_user_id", "review_organization_id", "policy_id", "rule_id"]:
        op.drop_index(f"ix_violation_candidates_{column}", table_name="violation_candidates")
    op.drop_constraint("fk_violation_candidates_reviewed_user_users", "violation_candidates", type_="foreignkey")
    op.drop_constraint("fk_violation_candidates_review_org_organizations", "violation_candidates", type_="foreignkey")
    op.drop_constraint("fk_violation_candidates_policy_id_enforcement_policies", "violation_candidates", type_="foreignkey")
    op.drop_constraint("fk_violation_candidates_rule_id_speed_rules", "violation_candidates", type_="foreignkey")
    op.drop_column("violation_candidates", "reviewed_by_user_id")
    op.drop_column("violation_candidates", "evidence")
    op.drop_column("violation_candidates", "review_organization_id")
    op.drop_column("violation_candidates", "policy_id")
    op.drop_column("violation_candidates", "rule_id")
    op.drop_index("ix_speed_rules_geofence_id", table_name="speed_rules")
    op.drop_constraint("fk_speed_rules_geofence_id_enforcement_geofences", "speed_rules", type_="foreignkey")
    op.drop_column("speed_rules", "geofence_id")
    op.drop_table("enforcement_geofences")
