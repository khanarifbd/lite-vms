#!/usr/bin/env python3
import argparse
import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

# Allow this script to be executed directly from deployment/ while importing app.*.
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import httpx
from sqlalchemy import func, or_, select

from app.core.database import close_database, get_session_factory
from app.db import models as db_models  # noqa: F401
from app.modules.telemetry.model import TelemetryPoint
from app.modules.tracking.model import TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle


def packet(
    *,
    registration: str,
    imei: str,
    op: str,
    tracker_time: datetime,
    latitude: float | None = None,
    longitude: float | None = None,
    speed: float | None = None,
) -> dict:
    data = {
        "registration_number": registration,
        "imei": imei,
        "op": op,
        "dt_tracker": tracker_time.isoformat(),
        "dt_provider_received": (tracker_time + timedelta(seconds=1)).isoformat(),
        "loc_valid": op == "loc",
        "params": {"ignition": True, "battery_voltage": 12.6},
        "protocol": "gt06",
        "net_protocol": "tcp",
        "ip": "127.0.0.1",
        "port": 5023,
        "event": "phase1-verification",
    }
    if op == "loc":
        data.update(
            {
                "lat": latitude,
                "lng": longitude,
                "speed": speed,
                "angle": 180,
                "altitude": 12,
            }
        )
    return data


async def post_packet(client: httpx.AsyncClient, payload: dict, label: str) -> None:
    response = await client.post("/api/v1/telemetry", json={"packets": [payload]})
    response.raise_for_status()
    body = response.json()
    if body.get("accepted") != 1:
        raise RuntimeError(f"{label} was not accepted: {body}")
    print(f"PASS API {label}: accepted")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Verify BNVP telemetry Phase 1 end to end")
    parser.add_argument("--registration", required=True)
    parser.add_argument("--imei", required=True)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--wait-seconds", type=float, default=3.0)
    args = parser.parse_args()

    registration_normalized = "".join(ch for ch in args.registration.upper() if ch.isalnum())
    session_factory = get_session_factory()

    async with session_factory() as session:
        vehicle = await session.scalar(
            select(Vehicle).where(
                or_(
                    Vehicle.registration_number == args.registration,
                    Vehicle.registration_number == registration_normalized,
                )
            )
        )
        if vehicle is None:
            raise RuntimeError("Vehicle was not found")
        before_count = await session.scalar(
            select(func.count(TelemetryPoint.id)).where(TelemetryPoint.vehicle_id == vehicle.id)
        )
        assignment = await session.scalar(
            select(VehicleDeviceAssignment)
            .where(
                VehicleDeviceAssignment.vehicle_id == vehicle.id,
                VehicleDeviceAssignment.valid_to.is_(None),
            )
            .order_by(VehicleDeviceAssignment.valid_from.desc())
        )
        if assignment is None:
            raise RuntimeError("No current device assignment was found")
        device = await session.get(TrackingDevice, assignment.device_id)
        if device is None:
            raise RuntimeError("Assigned device was not found")
        assigned_imei = "".join(ch for ch in (device.imei or device.device_identifier) if ch.isdigit())
        requested_imei = "".join(ch for ch in args.imei if ch.isdigit())
        if assigned_imei != requested_imei:
            raise RuntimeError(f"IMEI mismatch: assigned={assigned_imei} requested={requested_imei}")

    newest_time = datetime.now(UTC).replace(microsecond=0)
    older_time = newest_time - timedelta(minutes=5)
    newest_lat, newest_lng, newest_speed = 23.81031, 90.41251, 41.5
    older_lat, older_lng, older_speed = 24.00001, 91.00001, 12.0

    newest = packet(
        registration=args.registration,
        imei=args.imei,
        op="loc",
        tracker_time=newest_time,
        latitude=newest_lat,
        longitude=newest_lng,
        speed=newest_speed,
    )
    older = packet(
        registration=args.registration,
        imei=args.imei,
        op="loc",
        tracker_time=older_time,
        latitude=older_lat,
        longitude=older_lng,
        speed=older_speed,
    )
    heartbeat = packet(
        registration=args.registration,
        imei=args.imei,
        op="noloc",
        tracker_time=newest_time + timedelta(seconds=10),
    )

    async with httpx.AsyncClient(base_url=args.base_url, timeout=15) as client:
        await post_packet(client, newest, "new LOC")
        await post_packet(client, newest, "duplicate LOC request")
        await post_packet(client, older, "out-of-order LOC")
        await post_packet(client, heartbeat, "NOLOC heartbeat")

    await asyncio.sleep(args.wait_seconds)

    async with session_factory() as session:
        vehicle = await session.scalar(
            select(Vehicle).where(
                or_(
                    Vehicle.registration_number == args.registration,
                    Vehicle.registration_number == registration_normalized,
                )
            )
        )
        assert vehicle is not None
        after_count = await session.scalar(
            select(func.count(TelemetryPoint.id)).where(TelemetryPoint.vehicle_id == vehicle.id)
        )
        assignment = await session.scalar(
            select(VehicleDeviceAssignment)
            .where(
                VehicleDeviceAssignment.vehicle_id == vehicle.id,
                VehicleDeviceAssignment.valid_to.is_(None),
            )
            .order_by(VehicleDeviceAssignment.valid_from.desc())
        )
        assert assignment is not None
        device = await session.get(TrackingDevice, assignment.device_id)
        assert device is not None

        if after_count != before_count + 2:
            raise RuntimeError(
                f"History count failed: expected {before_count + 2}, got {after_count}"
            )
        print("PASS storage: duplicate ignored and two LOC history rows stored")

        if (
            vehicle.latest_latitude != newest_lat
            or vehicle.latest_longitude != newest_lng
            or vehicle.latest_speed_kph != newest_speed
        ):
            raise RuntimeError(
                "Out-of-order protection failed: latest vehicle status was overwritten"
            )
        print("PASS latest status: older LOC did not overwrite newest LOC")

        recorded_at = vehicle.last_recorded_at
        if recorded_at is None:
            raise RuntimeError("Vehicle last_recorded_at was not updated")
        if recorded_at.tzinfo is None:
            recorded_at = recorded_at.replace(tzinfo=UTC)
        if recorded_at.astimezone(UTC) != newest_time:
            raise RuntimeError(
                f"Latest tracker time mismatch: expected {newest_time}, got {recorded_at}"
            )
        print("PASS tracker time: latest LOC timestamp retained")

        if device.last_seen_at is None:
            raise RuntimeError("NOLOC heartbeat did not update device last_seen_at")
        print("PASS heartbeat: device last_seen_at updated without location history")

    await close_database()
    print("\nPHASE 1 VERIFICATION PASSED")


if __name__ == "__main__":
    asyncio.run(main())
