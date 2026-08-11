"""Persist driver duty intervals for incident-time attribution.

Revision ID: 0034_driver_duty_sessions
Revises: 0033_driver_duty_roster
"""

import uuid
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "0034_driver_duty_sessions"
down_revision = "0033_driver_duty_roster"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bigint_pk = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
    op.create_table(
        "driver_duty_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("assignment_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_by_user_id", bigint_pk, nullable=False),
        sa.Column("ended_by_user_id", bigint_pk, nullable=True),
        sa.Column("start_reason", sa.Text(), nullable=False),
        sa.Column("end_reason", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.String(length=40),
            server_default=sa.text("'assignment'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assignment_id"],
            ["driver_assignments.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["vehicle_owners.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["started_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["ended_by_user_id"],
            ["users.id"],
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "ended_at IS NULL OR ended_at >= started_at",
            name="ck_driver_duty_sessions_valid_interval",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in (
        "assignment_id",
        "vehicle_id",
        "driver_id",
        "owner_id",
        "started_at",
        "ended_at",
        "started_by_user_id",
        "ended_by_user_id",
    ):
        op.create_index(
            f"ix_driver_duty_sessions_{column}",
            "driver_duty_sessions",
            [column],
            unique=False,
        )

    duty_sessions = sa.table(
        "driver_duty_sessions",
        sa.column("id", sa.Uuid()),
        sa.column("assignment_id", sa.Uuid()),
        sa.column("vehicle_id", sa.Uuid()),
        sa.column("driver_id", sa.Uuid()),
        sa.column("owner_id", sa.Uuid()),
        sa.column("started_at", sa.DateTime(timezone=True)),
        sa.column("ended_at", sa.DateTime(timezone=True)),
        sa.column("started_by_user_id", bigint_pk),
        sa.column("ended_by_user_id", bigint_pk),
        sa.column("start_reason", sa.Text()),
        sa.column("end_reason", sa.Text()),
        sa.column("source", sa.String(length=40)),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    assignment_history = sa.text(
        """
        SELECT
            id,
            vehicle_id,
            driver_id,
            owner_id,
            assigned_by_user_id,
            valid_from,
            valid_to,
            status,
            is_on_duty,
            notes,
            updated_at
        FROM driver_assignments
        WHERE status = 'ENDED'
           OR (status = 'ACTIVE' AND is_on_duty IS TRUE)
        """
    ).columns(
        id=sa.Uuid(),
        vehicle_id=sa.Uuid(),
        driver_id=sa.Uuid(),
        owner_id=sa.Uuid(),
        assigned_by_user_id=bigint_pk,
        valid_from=sa.DateTime(timezone=True),
        valid_to=sa.DateTime(timezone=True),
        status=sa.String(length=24),
        is_on_duty=sa.Boolean(),
        notes=sa.Text(),
        updated_at=sa.DateTime(),
    )
    rows = op.get_bind().execute(assignment_history).mappings()
    recorded_at = datetime.now()
    backfill = []
    for row in rows:
        is_open = row["status"] == "ACTIVE" and bool(row["is_on_duty"])
        ended_at = None if is_open else row["valid_to"] or row["updated_at"]
        if ended_at is not None and ended_at < row["valid_from"]:
            ended_at = row["valid_from"]
        reason = row["notes"] or "Backfilled from historical vehicle assignment"
        backfill.append(
            {
                "id": uuid.uuid4(),
                "assignment_id": row["id"],
                "vehicle_id": row["vehicle_id"],
                "driver_id": row["driver_id"],
                "owner_id": row["owner_id"],
                "started_at": row["valid_from"],
                "ended_at": ended_at,
                "started_by_user_id": row["assigned_by_user_id"],
                "ended_by_user_id": None,
                "start_reason": reason,
                "end_reason": None if is_open else reason,
                "source": "migration_assignment_interval",
                "created_at": recorded_at,
                "updated_at": recorded_at,
            }
        )
    if backfill:
        op.bulk_insert(duty_sessions, backfill)

    op.create_index(
        "uq_driver_duty_sessions_open_vehicle",
        "driver_duty_sessions",
        ["vehicle_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
        sqlite_where=sa.text("ended_at IS NULL"),
    )
    op.create_index(
        "uq_driver_duty_sessions_open_driver",
        "driver_duty_sessions",
        ["driver_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
        sqlite_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("driver_duty_sessions")
