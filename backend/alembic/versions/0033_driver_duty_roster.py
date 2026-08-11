"""Allow a vehicle roster to contain multiple drivers with one on duty.

Revision ID: 0033_driver_duty_roster
Revises: 0032_active_drv_assign
"""

import sqlalchemy as sa
from alembic import op

revision = "0033_driver_duty_roster"
down_revision = "0032_active_drv_assign"
branch_labels = None
depends_on = None


def close_duplicate_active_vehicle_assignments() -> None:
    op.execute(
        sa.text(
            """
            UPDATE driver_assignments
            SET status = 'ENDED',
                is_on_duty = FALSE,
                valid_to = COALESCE(valid_to, CURRENT_TIMESTAMP)
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY vehicle_id
                            ORDER BY valid_from DESC, created_at DESC, id DESC
                        ) AS row_number
                    FROM driver_assignments
                    WHERE status = 'ACTIVE'
                ) AS ranked
                WHERE row_number > 1
            )
            """
        )
    )


def upgrade() -> None:
    op.add_column(
        "driver_assignments",
        sa.Column(
            "is_on_duty",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.drop_index(
        "uq_driver_assignments_active_vehicle",
        table_name="driver_assignments",
    )

    op.execute(
        sa.text(
            """
            UPDATE driver_assignments
            SET is_on_duty = TRUE
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY vehicle_id
                            ORDER BY valid_from DESC, created_at DESC, id DESC
                        ) AS row_number
                    FROM driver_assignments
                    WHERE status = 'ACTIVE'
                ) AS ranked
                WHERE row_number = 1
            )
            """
        )
    )

    op.create_index(
        "ix_driver_assignments_is_on_duty",
        "driver_assignments",
        ["is_on_duty"],
        unique=False,
    )
    op.create_index(
        "uq_driver_assignments_on_duty_vehicle",
        "driver_assignments",
        ["vehicle_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE' AND is_on_duty IS TRUE"),
        sqlite_where=sa.text("status = 'ACTIVE' AND is_on_duty = 1"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_driver_assignments_on_duty_vehicle",
        table_name="driver_assignments",
    )
    op.drop_index(
        "ix_driver_assignments_is_on_duty",
        table_name="driver_assignments",
    )
    close_duplicate_active_vehicle_assignments()
    with op.batch_alter_table("driver_assignments") as batch_op:
        batch_op.drop_column("is_on_duty")

    active_only = sa.text("status = 'ACTIVE'")
    op.create_index(
        "uq_driver_assignments_active_vehicle",
        "driver_assignments",
        ["vehicle_id"],
        unique=True,
        postgresql_where=active_only,
        sqlite_where=active_only,
    )
