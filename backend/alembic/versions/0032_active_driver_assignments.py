"""Enforce one active vehicle assignment per driver and vehicle.

Revision ID: 0032_active_drv_assign
Revises: 0031_drv_mobile_reg
"""

import sqlalchemy as sa
from alembic import op

revision = "0032_active_drv_assign"
down_revision = "0031_drv_mobile_reg"
branch_labels = None
depends_on = None


def close_duplicate_active_assignments(partition_column: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE driver_assignments
            SET status = 'ENDED',
                valid_to = COALESCE(valid_to, CURRENT_TIMESTAMP)
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY {partition_column}
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
    close_duplicate_active_assignments("driver_id")
    close_duplicate_active_assignments("vehicle_id")
    active_only = sa.text("status = 'ACTIVE'")
    op.create_index(
        "uq_driver_assignments_active_driver",
        "driver_assignments",
        ["driver_id"],
        unique=True,
        postgresql_where=active_only,
        sqlite_where=active_only,
    )
    op.create_index(
        "uq_driver_assignments_active_vehicle",
        "driver_assignments",
        ["vehicle_id"],
        unique=True,
        postgresql_where=active_only,
        sqlite_where=active_only,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_driver_assignments_active_vehicle",
        table_name="driver_assignments",
    )
    op.drop_index(
        "uq_driver_assignments_active_driver",
        table_name="driver_assignments",
    )
