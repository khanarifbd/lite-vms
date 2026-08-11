#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '\n[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || die "Run with sudo: sudo bash deployment/timezone/setup_utc.sh"

command -v timedatectl >/dev/null 2>&1 || die "timedatectl is required"

log "Setting operating-system timezone to UTC"
timedatectl set-timezone UTC
if timedatectl set-ntp true 2>/dev/null; then
  log "Network time synchronization enabled"
else
  log "Warning: timedatectl could not enable NTP; verify chrony/systemd-timesyncd manually"
fi

if command -v psql >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  log "Setting PostgreSQL default timezone to UTC"
  runuser -u postgres -- psql --set ON_ERROR_STOP=1 --dbname postgres <<'SQL'
ALTER SYSTEM SET timezone = 'UTC';
SELECT pg_reload_conf();
SQL
else
  log "Warning: local PostgreSQL admin was not found; PostgreSQL timezone was not changed"
fi

if command -v clickhouse-client >/dev/null 2>&1 && systemctl list-unit-files clickhouse-server.service >/dev/null 2>&1; then
  log "Setting ClickHouse server timezone to UTC"
  install -d -m 0755 /etc/clickhouse-server/config.d
  cat > /etc/clickhouse-server/config.d/timezone.xml <<'XML'
<clickhouse>
    <timezone>UTC</timezone>
</clickhouse>
XML
  chmod 0644 /etc/clickhouse-server/config.d/timezone.xml
  systemctl restart clickhouse-server
  systemctl is-active --quiet clickhouse-server || die "ClickHouse failed to restart"
else
  log "Warning: ClickHouse was not found; ClickHouse timezone was not changed"
fi

log "UTC infrastructure setup completed"
printf 'OS timezone:         %s\n' "$(timedatectl show --property=Timezone --value)"
printf 'OS UTC time:         %s\n' "$(date -u --iso-8601=seconds)"

if command -v psql >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  printf 'PostgreSQL timezone: %s\n' "$(runuser -u postgres -- psql -Atqc 'SHOW timezone' postgres)"
fi

if command -v clickhouse-client >/dev/null 2>&1; then
  printf 'ClickHouse timezone: %s\n' "$(clickhouse-client --query 'SELECT timezone()' 2>/dev/null || printf 'authentication required')"
fi
