"""Add registered owner name to vehicles.

Revision ID: 0040_vehicle_registered_owner
Revises: 0039_vehicle_vts_installation_date
"""

import sqlalchemy as sa
from alembic import op

revision = "0040_vehicle_registered_owner"
down_revision = "0039_vehicle_vts_installation_date"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.add_column(sa.Column("registered_owner_name", sa.String(180), nullable=True))

    op.execute(
        """
        UPDATE vehicles
        SET registered_owner_name = (
            SELECT vehicle_owners.name
            FROM vehicle_owners
            WHERE vehicle_owners.id = vehicles.owner_id
        )
        WHERE registered_owner_name IS NULL
        """
    )
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.alter_column(
            "registered_owner_name",
            existing_type=sa.String(180),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.drop_column("registered_owner_name")
