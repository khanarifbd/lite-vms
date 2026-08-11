"""Add driver approval queue cursor index.

Revision ID: 0030_drv_approval_idx
Revises: 0029_approval_cursor_indexes
"""

from alembic import op

revision = "0030_drv_approval_idx"
down_revision = "0029_approval_cursor_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_drivers_verification_created_id",
        "drivers",
        ["verification_status", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_drivers_verification_created_id",
        table_name="drivers",
    )
