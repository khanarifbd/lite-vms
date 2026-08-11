# ClickHouse Deployment Guide

This guide documents the ClickHouse setup used by the Bangladesh National Vehicle Platform telemetry pipeline.

## Storage architecture

- PostgreSQL stores the current/latest vehicle status and device heartbeat.
- ClickHouse stores valid historical location packets.
- Kafka transports accepted telemetry packets to the telemetry consumer.
- `noloc` heartbeat packets do not create rows in ClickHouse.

```text
Telemetry API -> Kafka -> Telemetry Consumer
                           |-- PostgreSQL: latest status / last_seen
                           `-- ClickHouse: location history
```

## 1. Install ClickHouse on Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

curl -fsSL \
  https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key \
  | sudo gpg --dearmor \
  -o /usr/share/keyrings/clickhouse-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/clickhouse.list

sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client
sudo systemctl enable --now clickhouse-server
```

Check the service:

```bash
sudo systemctl status clickhouse-server --no-pager -l
clickhouse-client --query "SELECT version()"
```

## 2. Reset the local default password when required

The `default` user is normally managed by XML configuration and may be read-only from SQL. If the password is unknown, inspect the local user configuration:

```bash
sudo ls -la /etc/clickhouse-server/users.d/
```

If `/etc/clickhouse-server/users.d/default-password.xml` exists, back it up and restart ClickHouse:

```bash
sudo mv \
  /etc/clickhouse-server/users.d/default-password.xml \
  /etc/clickhouse-server/users.d/default-password.xml.backup

sudo systemctl restart clickhouse-server
clickhouse-client --user default --query "SELECT version()"
```

Do not use `ALTER USER default` when the user comes from XML storage. ClickHouse will return `ACCESS_STORAGE_READONLY`.

## 3. Create the application database and local user

Run the following from the normal Linux shell, not from inside the interactive ClickHouse prompt:

```bash
clickhouse-client --multiquery <<'SQL'
CREATE DATABASE IF NOT EXISTS bnvp_tracking;

CREATE USER IF NOT EXISTS bnvp_app
IDENTIFIED WITH no_password;

GRANT SELECT, INSERT, CREATE TABLE
ON bnvp_tracking.*
TO bnvp_app;
SQL
```

This passwordless user is acceptable only while ClickHouse is restricted to localhost. Never expose ports `8123` or `9000` publicly with this configuration.

Test the user:

```bash
clickhouse-client \
  --user bnvp_app \
  --query "SELECT currentUser(), version()"
```

## 4. Bootstrap the history schema

From the repository root:

```bash
cd /opt/bnvp

clickhouse-client \
  --multiquery \
  < deployment/clickhouse/bootstrap.sql
```

Verify the table:

```bash
clickhouse-client \
  --user bnvp_app \
  --query "SHOW CREATE TABLE bnvp_tracking.vehicle_position_history"
```

The table uses:

- `ReplacingMergeTree(ingested_at)`
- monthly partitions using `toYYYYMM(recorded_at)`
- ordering by vehicle and tracker time
- a five-year TTL on `recorded_at`

## 5. Configure the backend environment

Add the following values to `/opt/bnvp/.env`:

```env
CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_PORT=8123
CLICKHOUSE_USERNAME=bnvp_app
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=bnvp_tracking
CLICKHOUSE_SECURE=false
CLICKHOUSE_CONNECT_TIMEOUT_SECONDS=10
CLICKHOUSE_SEND_RECEIVE_TIMEOUT_SECONDS=30
CLICKHOUSE_HISTORY_TABLE=vehicle_position_history
```

Secure the environment file:

```bash
sudo chown root:root /opt/bnvp/.env
sudo chmod 600 /opt/bnvp/.env
```

## 6. Deploy and restart services

```bash
cd /opt/bnvp
sudo bash deployment/deploy.sh
```

Or restart only the telemetry consumer:

```bash
sudo systemctl restart bnvp-api-telemetry-consumer.service
sudo systemctl status bnvp-api-telemetry-consumer.service --no-pager -l
```

## 7. Verify ClickHouse history ingestion

Send a new valid `loc` telemetry packet, then query the latest rows:

```bash
clickhouse-client \
  --user bnvp_app \
  --query "
SELECT
    packet_id,
    registration_number,
    imei,
    latitude,
    longitude,
    speed_kph,
    heading,
    ignition,
    recorded_at,
    ingested_at
FROM bnvp_tracking.vehicle_position_history
ORDER BY ingested_at DESC
LIMIT 10
"
```

Check consumer logs:

```bash
sudo journalctl \
  -u bnvp-api-telemetry-consumer.service \
  --since "5 minutes ago" \
  --no-pager -l
```

Expected successful outcome:

```text
Telemetry packet stored ... result=location
```

## 8. Verify PostgreSQL latest status

ClickHouse contains history, while PostgreSQL retains only the current status fields:

```sql
SELECT
    registration_number,
    latest_latitude,
    latest_longitude,
    latest_speed_kph,
    last_recorded_at
FROM vehicles
ORDER BY last_recorded_at DESC NULLS LAST
LIMIT 10;
```

## 9. Network security

ClickHouse must remain localhost-only in the current passwordless configuration.

Check listening addresses:

```bash
sudo ss -lntp | grep -E ':8123|:9000'
```

If UFW is enabled, do not add public allow rules for these ports. Explicit denial can be added when needed:

```bash
sudo ufw deny 8123/tcp
sudo ufw deny 9000/tcp
```

The backend connects through `127.0.0.1`, so public access is unnecessary.

## 10. Common errors

### `AUTHENTICATION_FAILED`

The supplied password is wrong, or the XML-managed default user still has a password. Follow the password reset section above.

### `ACCESS_STORAGE_READONLY`

The `default` user is defined in XML configuration and cannot be altered with SQL. Create a separate `bnvp_app` user instead.

### Syntax error near `clickhouse-client`

A shell command was pasted into the interactive ClickHouse prompt. Run `exit;`, return to the Linux terminal, and execute the shell command there.

### Consumer is running but no history row appears

Check:

```bash
sudo journalctl \
  -u bnvp-api-telemetry-consumer.service \
  --since "10 minutes ago" \
  --no-pager -l
```

Confirm that:

- the packet uses `op=loc`
- `loc_valid=true`
- latitude and longitude are present
- the ClickHouse table exists
- `.env` contains the correct ClickHouse settings
- the consumer was restarted after `.env` changes
