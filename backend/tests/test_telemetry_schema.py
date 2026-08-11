from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.telemetry.schema import TelemetryIngest


def test_telemetry_requires_vehicle_identity() -> None:
    with pytest.raises(ValidationError):
        TelemetryIngest(
            provider_code="VTS001",
            recorded_at=datetime.now(UTC),
            latitude=23.8103,
            longitude=90.4125,
        )


def test_telemetry_accepts_device_id() -> None:
    payload = TelemetryIngest(
        provider_code="VTS001",
        device_id="860123456789012",
        recorded_at=datetime.now(UTC),
        latitude=23.8103,
        longitude=90.4125,
        speed_kph=82,
    )
    assert payload.device_id == "860123456789012"
