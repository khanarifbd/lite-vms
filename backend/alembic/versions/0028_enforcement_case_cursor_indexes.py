"""Add composite indexes for enforcement case cursor pagination.

Revision ID: 0028_case_cursor_indexes
Revises: 0027_review_cursor_index
"""

from alembic import op

revision = "0028_case_cursor_indexes"
down_revision = "0027_review_cursor_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_enforcement_cases_opened_id",
        "enforcement_cases",
        ["opened_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_enforcement_cases_status_opened_id",
        "enforcement_cases",
        ["status", "opened_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_enforcement_cases_status_opened_id",
        table_name="enforcement_cases",
    )
    op.drop_index(
        "ix_enforcement_cases_opened_id",
        table_name="enforcement_cases",
    )