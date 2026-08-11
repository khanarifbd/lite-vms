"""Lock verified Driver applications and separate later profile review.

Revision ID: 0035_driver_application_lock
Revises: 0034_driver_duty_sessions
"""

import sqlalchemy as sa
from alembic import op

revision = "0035_driver_application_lock"
down_revision = "0034_driver_duty_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "drivers",
        sa.Column("profile_change_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "drivers",
        sa.Column("pending_profile_changes", sa.JSON(), nullable=True),
    )
    op.add_column(
        "drivers",
        sa.Column(
            "profile_change_submitted_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "drivers",
        sa.Column(
            "profile_change_reviewed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "drivers",
        sa.Column("profile_change_review_notes", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_drivers_profile_change_status",
        "drivers",
        ["profile_change_status"],
        unique=False,
    )
    op.create_index(
        "ix_drivers_profile_change_submitted_at",
        "drivers",
        ["profile_change_submitted_at"],
        unique=False,
    )

    bind = op.get_bind()
    repaired = list(
        bind.execute(
            sa.text(
                """
                SELECT
                    d.id,
                    d.user_id,
                    approved.actor_user_id,
                    approved.created_at
                FROM drivers AS d
                JOIN audit_logs AS approved
                  ON approved.resource_type = 'driver'
                 AND approved.resource_public_id = d.id
                 AND approved.action = 'driver.application_approve'
                WHERE d.verification_status = 'PENDING'
                  AND approved.created_at = (
                      SELECT MAX(latest.created_at)
                      FROM audit_logs AS latest
                      WHERE latest.resource_type = 'driver'
                        AND latest.resource_public_id = d.id
                        AND latest.action = 'driver.application_approve'
                  )
                """
            ).columns(
                id=sa.Uuid(),
                user_id=sa.BigInteger(),
                actor_user_id=sa.BigInteger(),
                created_at=sa.DateTime(timezone=True),
            )
        ).mappings()
    )
    for row in repaired:
        bind.execute(
            sa.text(
                """
                UPDATE drivers
                SET verification_status = 'VERIFIED',
                    reviewed_by_user_id = :actor_user_id,
                    reviewed_at = :reviewed_at,
                    review_notes = :review_notes
                WHERE id = :driver_id
                """
            ).bindparams(
                sa.bindparam("driver_id", type_=sa.Uuid()),
                sa.bindparam("actor_user_id", type_=sa.BigInteger()),
                sa.bindparam("reviewed_at", type_=sa.DateTime(timezone=True)),
                sa.bindparam("review_notes", type_=sa.Text()),
            ),
            {
                "driver_id": row["id"],
                "actor_user_id": row["actor_user_id"],
                "reviewed_at": row["created_at"],
                "review_notes": "Verified status restored after legacy application resubmission",
            },
        )
        bind.execute(
            sa.text(
                """
                UPDATE driver_licences
                SET verification_status = 'VERIFIED',
                    verified_by_user_id = :actor_user_id,
                    verified_at = :reviewed_at,
                    review_notes = :review_notes
                WHERE driver_id = :driver_id
                """
            ).bindparams(
                sa.bindparam("driver_id", type_=sa.Uuid()),
                sa.bindparam("actor_user_id", type_=sa.BigInteger()),
                sa.bindparam("reviewed_at", type_=sa.DateTime(timezone=True)),
                sa.bindparam("review_notes", type_=sa.Text()),
            ),
            {
                "driver_id": row["id"],
                "actor_user_id": row["actor_user_id"],
                "reviewed_at": row["created_at"],
                "review_notes": "Verified status restored after legacy application resubmission",
            },
        )
        bind.execute(
            sa.text(
                """
                UPDATE driver_documents
                SET status = 'VERIFIED',
                    verified_by_user_id = :actor_user_id,
                    verified_at = :reviewed_at,
                    review_notes = :review_notes
                WHERE driver_id = :driver_id
                  AND is_active IS TRUE
                """
            ).bindparams(
                sa.bindparam("driver_id", type_=sa.Uuid()),
                sa.bindparam("actor_user_id", type_=sa.BigInteger()),
                sa.bindparam("reviewed_at", type_=sa.DateTime(timezone=True)),
                sa.bindparam("review_notes", type_=sa.Text()),
            ),
            {
                "driver_id": row["id"],
                "actor_user_id": row["actor_user_id"],
                "reviewed_at": row["created_at"],
                "review_notes": "Verified status restored after legacy application resubmission",
            },
        )
        bind.execute(
            sa.text(
                """
                UPDATE users
                SET identity_verification_status = 'VERIFIED',
                    identity_assurance_level = 'SUBSTANTIAL'
                WHERE id = :user_id
                """
            ),
            {"user_id": row["user_id"]},
        )


def downgrade() -> None:
    op.drop_index("ix_drivers_profile_change_submitted_at", table_name="drivers")
    op.drop_index("ix_drivers_profile_change_status", table_name="drivers")
    op.drop_column("drivers", "profile_change_review_notes")
    op.drop_column("drivers", "profile_change_reviewed_at")
    op.drop_column("drivers", "profile_change_submitted_at")
    op.drop_column("drivers", "pending_profile_changes")
    op.drop_column("drivers", "profile_change_status")
