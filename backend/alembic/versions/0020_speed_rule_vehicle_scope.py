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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    column_names = {column["name"] for column in inspector.get_columns("speed_rules")}
    index_names = {index["name"] for index in inspector.get_indexes("speed_rules")}

    if "vehicle_scope" not in column_names:
        op.add_column(
            "speed_rules",
            sa.Column("vehicle_scope", sa.String(length=30), nullable=False, server_default="all"),
        )
    if "vehicle_ids" not in column_names:
        op.add_column("speed_rules", sa.Column("vehicle_ids", sa.JSON(), nullable=True))
    if "ix_speed_rules_vehicle_scope" not in index_names:
        op.create_index("ix_speed_rules_vehicle_scope", "speed_rules", ["vehicle_scope"], unique=False)

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("speed_rules") as batch_op:
            batch_op.alter_column(
                "vehicle_scope",
                existing_type=sa.String(length=30),
                server_default=None,
            )
    else:
        op.alter_column("speed_rules", "vehicle_scope", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_speed_rules_vehicle_scope", table_name="speed_rules")
    op.drop_column("speed_rules", "vehicle_ids")
    op.drop_column("speed_rules", "vehicle_scope")
