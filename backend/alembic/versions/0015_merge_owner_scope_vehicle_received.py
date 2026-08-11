"""merge owner scope and vehicle receive-time migration heads

Revision ID: 0015_merge_scope_recv
Revises: 0014_owner_provider_scope, 0014_vehicle_last_received_at
Create Date: 2026-07-29
"""

from collections.abc import Sequence


revision: str = "0015_merge_scope_recv"
down_revision: tuple[str, str] = (
    "0014_owner_provider_scope",
    "0014_vehicle_last_received_at",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join both valid migration branches without changing schema."""


def downgrade() -> None:
    """Splitting the merge revision performs no schema change."""
