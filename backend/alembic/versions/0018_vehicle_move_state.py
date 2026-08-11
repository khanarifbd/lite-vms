"""Add authoritative vehicle movement state timing.

Revision ID: 0018_vehicle_move_state
Revises: 0017_vehicle_live_fields
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_vehicle_move_state"
down_revision: str | None = "0017_vehicle_live_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("movement_state", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("movement_state_changed_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index(
            "ix_vehicles_movement_state", ["movement_state"], unique=False
        )

    op.execute(
        """
        UPDATE vehicles
        SET movement_state = CASE
            WHEN COALESCE(latest_speed_kph, 0) > 3 THEN 'moving'
            WHEN latest_ignition IS TRUE THEN 'idle'
            ELSE 'stopped'
        END,
        movement_state_changed_at = last_received_at
        WHERE latest_latitude IS NOT NULL
          AND latest_longitude IS NOT NULL
          AND last_received_at IS NOT NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_index("ix_vehicles_movement_state")
        batch_op.drop_column("movement_state_changed_at")
        batch_op.drop_column("movement_state")
