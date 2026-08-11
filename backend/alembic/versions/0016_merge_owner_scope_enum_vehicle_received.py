"""merge owner scope enum and vehicle receive-time heads

Revision ID: 0016_merge_scope_recv
Revises: 0015_owner_provider_scope_enum, 0015_merge_scope_recv
Create Date: 2026-07-29
"""

from collections.abc import Sequence

revision: str = "0016_merge_scope_recv"
down_revision: tuple[str, str] = (
    "0015_owner_provider_scope_enum",
    "0015_merge_scope_recv",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
