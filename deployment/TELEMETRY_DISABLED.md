# Lite VMS: telemetry integration disabled

Lite VMS is currently a vehicle/owner registration and management application.
Kafka GPS ingestion and the provider telemetry integration workspace are **disabled**.
This is intentional; no Kafka or ClickHouse services are needed for Lite VMS.

## Production deployment checklist

1. Stop and prevent any previously installed telemetry worker from starting again.
   Check installed unit names first:

   ```bash
   systemctl list-unit-files '*telemetry*'
   systemctl list-units '*telemetry*'
   ```

   If the corresponding units exist, disable them (use the actual names shown):

   ```bash
   sudo systemctl disable --now bnvp-telemetry-consumer.service
   sudo systemctl disable --now vehicle-platform-telemetry-consumer.service
   ```

   A missing unit is fine. Confirm with `systemctl is-active <unit-name>`
   and `systemctl is-enabled <unit-name>`. Neither should be active/enabled.

2. Set `TELEMETRY_ENABLED=false` in the backend environment and restart
   the backend API. The code also never initializes a telemetry producer or
   registers ingestion endpoints, even if an old env file mistakenly enables it.

3. Deploy the frontend build. The provider navigation, integration page and
   telemetry-key API routes no longer expose that functionality.

Do **not** drop the telemetry tables or remove existing vehicle/device data;
that would risk unrelated vehicle registry, device assignment and audit records.
Tracking/monitoring code for other product phases remains in the repository,
but this disabled integration performs no Kafka ingestion or consumer work.
