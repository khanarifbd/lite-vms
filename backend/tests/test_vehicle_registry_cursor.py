import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import asyncpg

from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.registry_router import (
    cursor_timestamp_parameter,
    decode_cursor,
    encode_cursor,
)


def _compiled_cursor_query(created_at: datetime) -> str:
    timestamp_parameter = cursor_timestamp_parameter(created_at)
    statement = select(Vehicle.id).where(Vehicle.created_at < timestamp_parameter)
    return str(statement.compile(dialect=asyncpg.dialect()))


def test_vehicle_cursor_round_trip_preserves_aware_timestamp() -> None:
    created_at = datetime(2026, 8, 13, 10, 30, tzinfo=UTC)
    vehicle_id = uuid.uuid4()

    decoded_created_at, decoded_vehicle_id = decode_cursor(
        encode_cursor(created_at, vehicle_id)
    )

    assert decoded_created_at == created_at
    assert decoded_vehicle_id == vehicle_id


def test_vehicle_cursor_uses_timestamptz_bind_for_aware_timestamp() -> None:
    query = _compiled_cursor_query(datetime(2026, 8, 13, 10, 30, tzinfo=UTC))

    assert "TIMESTAMP WITH TIME ZONE" in query


def test_vehicle_cursor_keeps_naive_bind_compatible_with_local_dev() -> None:
    query = _compiled_cursor_query(datetime(2026, 8, 13, 16, 30))

    assert "TIMESTAMP WITHOUT TIME ZONE" in query
