"""Add composite index for cursor-based violation review pagination.

Revision ID: 0027_review_cursor_index
Revises: 0026_provider_api_keys
"""

from alembic import op

revision = "0027_review_cursor_index"
down_revision = "0026_provider_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_violation_candidates_status_detected_id",
        "violation_candidates",
        ["status", "detected_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_violation_candidates_status_detected_id",
        table_name="violation_candidates",
    )
