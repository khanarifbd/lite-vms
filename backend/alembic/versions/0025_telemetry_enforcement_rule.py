"""Record the matched enforcement rule on telemetry points.

Revision ID: 0025_telemetry_enforcement
Revises: 0024_vehicle_picker_search
"""

from alembic import op
import sqlalchemy as sa

revision = "0025_telemetry_enforcement"
down_revision = "0024_vehicle_picker_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("telemetry_points") as batch_op:
        batch_op.add_column(
            sa.Column("enforcement_rule_id", sa.Uuid(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("enforcement_threshold_kph", sa.Float(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_telemetry_points_enforcement_rule",
            "speed_rules",
            ["enforcement_rule_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        "ix_telemetry_points_enforcement_rule_id",
        "telemetry_points",
        ["enforcement_rule_id"],
    )
    op.create_index(
        "ix_telemetry_vehicle_rule_received",
        "telemetry_points",
        ["vehicle_id", "enforcement_rule_id", "received_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_telemetry_vehicle_rule_received", table_name="telemetry_points")
    op.drop_index("ix_telemetry_points_enforcement_rule_id", table_name="telemetry_points")
    op.drop_constraint(
        "fk_telemetry_points_enforcement_rule",
        "telemetry_points",
        type_="foreignkey",
    )
    op.drop_column("telemetry_points", "enforcement_threshold_kph")
    op.drop_column("telemetry_points", "enforcement_rule_id")
