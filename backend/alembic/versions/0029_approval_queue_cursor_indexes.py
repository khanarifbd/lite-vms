"""Add composite indexes for approval queue cursor pagination.

Revision ID: 0029_approval_cursor_indexes
Revises: 0028_case_cursor_indexes
"""

from alembic import op

revision = "0029_approval_cursor_indexes"
down_revision = "0028_case_cursor_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_vts_providers_status_created_id",
        "vts_providers",
        ["status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_vehicle_owners_verification_created_id",
        "vehicle_owners",
        ["verification_status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_vehicles_verification_created_id",
        "vehicles",
        ["verification_status", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_vehicles_verification_created_id",
        table_name="vehicles",
    )
    op.drop_index(
        "ix_vehicle_owners_verification_created_id",
        table_name="vehicle_owners",
    )
    op.drop_index(
        "ix_vts_providers_status_created_id",
        table_name="vts_providers",
    )
