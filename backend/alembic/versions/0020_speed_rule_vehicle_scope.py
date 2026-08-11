"""add speed rule vehicle scope

Revision ID: 0020_speed_rule_vehicle_scope
Revises: 0019_enforcement_config
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_speed_rule_vehicle_scope"
down_revision = "0019_enforcement_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "speed_rules",
        sa.Column("vehicle_scope", sa.String(length=30), nullable=False, server_default="all"),
    )
    op.add_column("speed_rules", sa.Column("vehicle_ids", sa.JSON(), nullable=True))
    op.create_index("ix_speed_rules_vehicle_scope", "speed_rules", ["vehicle_scope"], unique=False)
    op.alter_column("speed_rules", "vehicle_scope", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_speed_rules_vehicle_scope", table_name="speed_rules")
    op.drop_column("speed_rules", "vehicle_ids")
    op.drop_column("speed_rules", "vehicle_scope")
