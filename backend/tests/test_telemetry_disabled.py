from app.main import app


def test_telemetry_ingestion_and_provider_keys_are_not_registered() -> None:
    # Lite VMS must not expose Kafka ingestion or telemetry credential endpoints,
    # even if a legacy deployment still sets TELEMETRY_ENABLED=true.
    registered = {route.path for route in app.routes}
    assert not any(path.startswith("/api/v1/telemetry") for path in registered)
    assert "/api/v1/providers/me/integration" not in registered
    assert not any(path.endswith("/telemetry-api-key") for path in registered)
    assert not any(path.endswith("/telemetry-api-key/revoke") for path in registered)
