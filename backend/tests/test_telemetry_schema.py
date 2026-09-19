from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.telemetry.schema import TrackingPacket


def valid_packet() -> dict:
    now = datetime.now(UTC)
    return {
        "registration_number": "DHAKA-METRO-123",
        "imei": "860123456789012",
        "op": "loc",
        "dt_tracker": now,
        "dt_provider_received": now,
        "lat": 23.8103,
        "lng": 90.4125,
        "loc_valid": True,
    }


def test_telemetry_requires_vehicle_identity() -> None:
    values = valid_packet()
    del values["registration_number"]
    with pytest.raises(ValidationError):
        TrackingPacket(**values)


def test_telemetry_accepts_imei() -> None:
    payload = TrackingPacket(**valid_packet())
    assert payload.imei == "860123456789012"
