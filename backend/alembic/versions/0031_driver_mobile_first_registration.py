"""Allow driver NID after mobile-first registration.

Revision ID: 0031_drv_mobile_reg
Revises: 0030_drv_approval_idx
"""

import sqlalchemy as sa
from alembic import op

revision = "0031_drv_mobile_reg"
down_revision = "0030_drv_approval_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("drivers") as batch_op:
        batch_op.alter_column(
            "nid_reference",
            existing_type=sa.String(length=120),
            nullable=True,
        )


def downgrade() -> None:
    op.execute(
        "UPDATE drivers SET nid_reference = 'PENDING-' || CAST(id AS TEXT) "
        "WHERE nid_reference IS NULL"
    )
    with op.batch_alter_table("drivers") as batch_op:
        batch_op.alter_column(
            "nid_reference",
            existing_type=sa.String(length=120),
            nullable=False,
        )
