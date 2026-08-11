#!/usr/bin/env python3
import asyncio
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import clickhouse_connect
from sqlalchemy import text

from app.core.config import settings
from app.core.database import close_database, get_session_factory


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def command_output(*command: str) -> str:
    return subprocess.check_output(command, text=True).strip()


async def verify() -> None:
    os_timezone = command_output("timedatectl", "show", "--property=Timezone", "--value")
    require(os_timezone == "UTC", f"OS timezone must be UTC, got {os_timezone}")
    print("PASS OS timezone: UTC")

    os_offset = datetime.now().astimezone().utcoffset()
    require(
        os_offset is not None and os_offset.total_seconds() == 0,
        f"Python local offset must be zero, got {os_offset}",
    )
    print("PASS Python process timezone: UTC")

    session_factory = get_session_factory()
    async with session_factory() as session:
        pg_timezone = await session.scalar(text("SHOW timezone"))
        pg_now = await session.scalar(text("SELECT CURRENT_TIMESTAMP"))
    require(
        str(pg_timezone).upper() in {"UTC", "ETC/UTC"},
        f"PostgreSQL timezone must be UTC, got {pg_timezone}",
    )
    require(
        pg_now is not None
        and pg_now.utcoffset() is not None
        and pg_now.utcoffset().total_seconds() == 0,
        f"PostgreSQL timestamp offset must be zero, got {pg_now}",
    )
    print("PASS PostgreSQL timezone: UTC")

    client = await asyncio.to_thread(
        clickhouse_connect.get_client,
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        username=settings.clickhouse_username,
        password=settings.clickhouse_password,
        database=settings.clickhouse_database,
        secure=settings.clickhouse_secure,
        connect_timeout=settings.clickhouse_connect_timeout_seconds,
        send_receive_timeout=settings.clickhouse_send_receive_timeout_seconds,
    )
    try:
        result = await asyncio.to_thread(
            client.query,
            "SELECT timezone(), toUnixTimestamp64Milli(now64(3, 'UTC'))",
        )
        ch_timezone, ch_epoch_ms = result.first_row
    finally:
        await asyncio.to_thread(client.close)

    require(
        str(ch_timezone).upper() in {"UTC", "ETC/UTC"},
        f"ClickHouse timezone must be UTC, got {ch_timezone}",
    )
    local_epoch_ms = int(datetime.now(UTC).timestamp() * 1000)
    clock_skew_ms = abs(local_epoch_ms - int(ch_epoch_ms))
    require(
        clock_skew_ms <= 30_000,
        f"ClickHouse UTC clock differs from server by {clock_skew_ms} ms",
    )
    print(f"PASS ClickHouse timezone: UTC (clock skew {clock_skew_ms} ms)")

    for service in ("bnvp-api.service", "bnvp-api-telemetry-consumer.service"):
        environment = command_output(
            "systemctl", "show", service, "--property=Environment", "--value"
        )
        require("TZ=UTC" in environment, f"{service} must include TZ=UTC")
        print(f"PASS systemd environment: {service} TZ=UTC")

    utc_now = datetime.now(UTC)
    print(f"\nUTC reference time: {utc_now.isoformat()}")
    print("TIMEZONE VERIFICATION PASSED")


async def main() -> None:
    try:
        await verify()
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
