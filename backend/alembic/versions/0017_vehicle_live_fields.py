"""Add latest heading and ignition to vehicle live state.

Revision ID: 0017_vehicle_live_fields
Revises: 0016_merge_scope_recv
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_vehicle_live_fields"
down_revision: str | None = "0016_merge_scope_recv"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("latest_heading", sa.Float(), nullable=True))
        batch_op.add_column(sa.Column("latest_ignition", sa.Boolean(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_column("latest_ignition")
        batch_op.drop_column("latest_heading")
