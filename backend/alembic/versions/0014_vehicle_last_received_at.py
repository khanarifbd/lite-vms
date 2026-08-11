"""add authoritative vehicle received time

Revision ID: 0014_vehicle_last_received_at
Revises: 0013_owner_profile_cleanup
Create Date: 2026-07-29
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0014_vehicle_last_received_at"
down_revision: str | None = "0013_owner_profile_cleanup"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("last_received_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Existing latest status rows predate authoritative receive-time tracking.
    # Backfill from the best available value so the first new packet can safely
    # replace it using its server receive timestamp.
    op.execute(
        "UPDATE vehicles SET last_received_at = last_recorded_at "
        "WHERE last_received_at IS NULL AND last_recorded_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("vehicles", "last_received_at")
