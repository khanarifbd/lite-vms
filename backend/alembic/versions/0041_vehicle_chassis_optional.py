"""Make vehicle chassis number optional.

Revision ID: 0041_vehicle_chassis_optional
Revises: 0040_vehicle_registered_owner
"""

import sqlalchemy as sa
from alembic import op

revision = "0041_vehicle_chassis_optional"
down_revision = "0040_vehicle_registered_owner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.alter_column(
            "chassis_number",
            existing_type=sa.String(length=120),
            nullable=True,
        )


def downgrade() -> None:
    op.execute(
        """
        UPDATE vehicles
        SET chassis_number = 'UNKNOWN-' || CAST(id AS VARCHAR)
        WHERE chassis_number IS NULL
        """
    )
    with op.batch_alter_table("vehicles") as batch_op:
        batch_op.alter_column(
            "chassis_number",
            existing_type=sa.String(length=120),
            nullable=False,
        )
