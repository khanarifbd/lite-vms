"""Add VTS installation date to vehicles.

Revision ID: 0039_vehicle_vts_installation_date
Revises: 0039_version_width
"""

import sqlalchemy as sa
from alembic import op

revision = "0039_vehicle_vts_installation_date"
down_revision = "0039_version_width"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("vts_installation_date", sa.Date(), nullable=True))
        batch_op.create_index("ix_vehicles_vts_installation_date", ["vts_installation_date"])


def downgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_index("ix_vehicles_vts_installation_date")
        batch_op.drop_column("vts_installation_date")
