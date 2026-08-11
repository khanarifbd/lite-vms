import asyncio
import json
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import clickhouse_connect
from clickhouse_connect.driver.client import Client

from app.core.config import settings


HISTORY_COLUMNS = [
    "packet_id",
    "vehicle_id",
    "provider_id",
    "source_id",
    "device_id",
    "assignment_id",
    "registration_number",
    "imei",
    "dt_tracker_original",
    "dt_provider_received_original",
    "recorded_at",
    "received_at",
    "latitude",
    "longitude",
    "speed_kph",
    "heading",
    "altitude_m",
    "ignition",
    "loc_valid",
    "protocol",
    "net_protocol",
    "ip_address",
    "port",
    "event_name",
    "params_json",
    "raw_payload_json",
    "ingested_at",
]


@lru_cache
def get_clickhouse_client() -> Client:
    return clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_username,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        secure=settings.clickhouse_secure,
        connect_timeout=settings.clickhouse_connect_timeout_seconds,
        send_receive_timeout=settings.clickhouse_send_receive_timeout_seconds,
    )


async def close_clickhouse() -> None:
    if get_clickhouse_client.cache_info().currsize:
        client = get_clickhouse_client()
        await asyncio.to_thread(client.close)
        get_clickhouse_client.cache_clear()


def _uuid_text(value: Any) -> str:
    return str(value or "00000000-0000-0000-0000-000000000000")


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def insert_position_history(
    event: dict[str, Any],
    *,
    recorded_at: datetime,
    received_at: datetime,
    latitude: float,
    longitude: float,
    speed_kph: float,
    heading: float | None,
    ignition: bool | None,
) -> None:
    # Preserve the device/provider timestamp strings exactly as received. The
    # parsed UTC values below are derived fields used only for sorting/querying.
    dt_tracker_original = str(event.get("dt_tracker") or "")
    dt_provider_received_original = str(event.get("dt_provider_received") or "")

    row = [
        str(event["packet_id"]),
        _uuid_text(event.get("vehicle_id")),
        _uuid_text(event.get("provider_id")),
        _uuid_text(event.get("source_id")),
        _uuid_text(event.get("device_id")),
        _uuid_text(event.get("assignment_id")),
        str(event.get("registration_number") or ""),
        str(event.get("imei") or ""),
        dt_tracker_original,
        dt_provider_received_original,
        _utc(recorded_at),
        _utc(received_at),
        float(latitude),
        float(longitude),
        float(speed_kph),
        float(heading) if heading is not None else None,
        float(event["altitude"]) if event.get("altitude") is not None else None,
        ignition,
        bool(event.get("loc_valid", False)),
        str(event.get("protocol") or ""),
        str(event.get("net_protocol") or ""),
        str(event.get("ip") or ""),
        int(event["port"]) if event.get("port") is not None else None,
        str(event.get("event") or ""),
        json.dumps(event.get("params") or {}, separators=(",", ":"), default=str),
        json.dumps(event, separators=(",", ":"), default=str),
        datetime.now(UTC),
    ]
    client = get_clickhouse_client()
    await asyncio.to_thread(
        client.insert,
        settings.clickhouse_history_table,
        [row],
        column_names=HISTORY_COLUMNS,
    )


async def count_packet_history(packet_id: str) -> int:
    client = get_clickhouse_client()
    result = await asyncio.to_thread(
        client.query,
        f"SELECT count() FROM {settings.clickhouse_history_table} FINAL WHERE packet_id = %(packet_id)s",
        parameters={"packet_id": packet_id},
    )
    return int(result.first_row[0])
