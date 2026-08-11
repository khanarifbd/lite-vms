"""assign speed rules to review organizations

Revision ID: 0021_speed_rule_review_org
Revises: 0020_speed_rule_vehicle_scope
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_speed_rule_review_org"
down_revision = "0020_speed_rule_vehicle_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    column_names = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("speed_rules")
    }
    with op.batch_alter_table("speed_rules") as batch_op:
        if "review_organization_id" not in column_names:
            batch_op.add_column(
                sa.Column("review_organization_id", sa.BigInteger(), nullable=True)
            )
        batch_op.create_foreign_key(
            "fk_speed_rules_review_organization_id_organizations",
            "organizations",
            ["review_organization_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_speed_rules_review_organization_id",
        "speed_rules",
        ["review_organization_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_speed_rules_review_organization_id", table_name="speed_rules")
    op.drop_constraint(
        "fk_speed_rules_review_organization_id_organizations",
        "speed_rules",
        type_="foreignkey",
    )
    op.drop_column("speed_rules", "review_organization_id")
