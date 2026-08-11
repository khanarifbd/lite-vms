"""Add owner mobile OTP password reset challenges.

Revision ID: 0007_owner_mobile_password_reset
Revises: 0006_owner_provider_registry
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_owner_mobile_password_reset"
down_revision: str | None = "0006_owner_provider_registry"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "owner_mobile_password_reset_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", bigint_pk, nullable=False),
        sa.Column("normalized_mobile", sa.String(length=30), nullable=False),
        sa.Column("otp_digest", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["vehicle_owners.id"],
            ondelete="CASCADE",
            name=op.f(
                "fk_owner_mobile_password_reset_challenges_owner_id_vehicle_owners"
            ),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
            name=op.f("fk_owner_mobile_password_reset_challenges_user_id_users"),
        ),
        sa.PrimaryKeyConstraint(
            "id",
            name=op.f("pk_owner_mobile_password_reset_challenges"),
        ),
    )
    for column in (
        "owner_id",
        "user_id",
        "normalized_mobile",
        "expires_at",
    ):
        op.create_index(
            op.f(f"ix_owner_mobile_password_reset_challenges_{column}"),
            "owner_mobile_password_reset_challenges",
            [column],
        )


def downgrade() -> None:
    for column in (
        "expires_at",
        "normalized_mobile",
        "user_id",
        "owner_id",
    ):
        op.drop_index(
            op.f(f"ix_owner_mobile_password_reset_challenges_{column}"),
            table_name="owner_mobile_password_reset_challenges",
        )
    op.drop_table("owner_mobile_password_reset_challenges")
