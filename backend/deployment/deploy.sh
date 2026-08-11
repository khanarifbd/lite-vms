#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-${SCRIPT_DIR}/deploy.env}"

log() {
    printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
    printf '\nERROR: %s\n' "$*" >&2
    exit 1
}

is_true() {
    case "${1,,}" in
        true|1|yes|y|on) return 0 ;;
        *) return 1 ;;
    esac
}

[[ ${EUID} -eq 0 ]] || die "Run this command with sudo: sudo bash deployment/deploy.sh"
[[ -f "${CONFIG_FILE}" ]] || die "Missing ${CONFIG_FILE}. Copy deployment/deploy.env.example to deployment/deploy.env first."

# shellcheck disable=SC1090
source "${CONFIG_FILE}"

SERVICE_NAME="${SERVICE_NAME:-vehicle-platform}"
CONSUMER_SERVICE_NAME="${CONSUMER_SERVICE_NAME:-${SERVICE_NAME}-telemetry-consumer}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-${SERVICE_NAME}}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-${REPO_ROOT}}"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8000}"
UVICORN_WORKERS="${UVICORN_WORKERS:-2}"
SERVER_NAME="${SERVER_NAME:-_}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-25m}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://${APP_HOST}:${APP_PORT}/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-2}"
DISABLE_DEFAULT_NGINX_SITE="${DISABLE_DEFAULT_NGINX_SITE:-true}"
SKIP_GIT_PULL="${SKIP_GIT_PULL:-false}"
VENV_DIR="${VENV_DIR:-.venv}"

for command_name in git python3 systemctl nginx curl runuser install mktemp flock getent find; do
    command -v "${command_name}" >/dev/null 2>&1 || die "Required command is missing: ${command_name}"
done

[[ -d "${APP_DIR}" ]] || die "APP_DIR does not exist: ${APP_DIR}"
APP_DIR="$(cd -- "${APP_DIR}" && pwd)"
[[ -d "${APP_DIR}/.git" ]] || die "APP_DIR is not a Git repository: ${APP_DIR}"
[[ -f "${APP_DIR}/.env" ]] || die "Missing production environment file: ${APP_DIR}/.env"

DETECTED_OWNER="$(stat -c '%U' "${APP_DIR}")"
DEFAULT_USER="${SUDO_USER:-${DETECTED_OWNER}}"
DEPLOY_USER="${DEPLOY_USER:-${DEFAULT_USER}}"
APP_USER="${APP_USER:-${DEFAULT_USER}}"

id "${DEPLOY_USER}" >/dev/null 2>&1 || die "DEPLOY_USER does not exist: ${DEPLOY_USER}"
id "${APP_USER}" >/dev/null 2>&1 || die "APP_USER does not exist: ${APP_USER}"
APP_GROUP="${APP_GROUP:-$(id -gn "${APP_USER}")}"
getent group "${APP_GROUP}" >/dev/null 2>&1 || die "APP_GROUP does not exist: ${APP_GROUP}"

if [[ "${VENV_DIR}" = /* ]]; then
    VENV_PATH="${VENV_DIR}"
else
    VENV_PATH="${APP_DIR}/${VENV_DIR}"
fi

[[ "${APP_PORT}" =~ ^[0-9]+$ ]] || die "APP_PORT must be numeric"
[[ "${UVICORN_WORKERS}" =~ ^[0-9]+$ ]] || die "UVICORN_WORKERS must be numeric"
(( UVICORN_WORKERS >= 1 )) || die "UVICORN_WORKERS must be at least 1"
[[ "${HEALTHCHECK_RETRIES}" =~ ^[0-9]+$ ]] || die "HEALTHCHECK_RETRIES must be numeric"
[[ "${HEALTHCHECK_DELAY_SECONDS}" =~ ^[0-9]+$ ]] || die "HEALTHCHECK_DELAY_SECONDS must be numeric"

exec 9>"/var/lock/${SERVICE_NAME}.deploy.lock"
flock -n 9 || die "Another ${SERVICE_NAME} deployment is already running"

TMP_SERVICE="$(mktemp)"
TMP_CONSUMER_SERVICE="$(mktemp)"
TMP_NGINX="$(mktemp)"
cleanup() {
    rm -f "${TMP_SERVICE}" "${TMP_CONSUMER_SERVICE}" "${TMP_NGINX}"
}
trap cleanup EXIT

show_failure_context() {
    local exit_code=$?
    local line_number="${1:-unknown}"
    trap - ERR
    printf '\nDeployment failed at line %s with exit code %s.\n' "${line_number}" "${exit_code}" >&2
    systemctl status "${SERVICE_NAME}" --no-pager -l >&2 || true
    systemctl status "${CONSUMER_SERVICE_NAME}" --no-pager -l >&2 || true
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager >&2 || true
    journalctl -u "${CONSUMER_SERVICE_NAME}" -n 100 --no-pager >&2 || true
    exit "${exit_code}"
}
trap 'show_failure_context ${LINENO}' ERR

user_home() {
    getent passwd "$1" | cut -d: -f6
}

run_as_user() {
    local username="$1"
    shift
    runuser -u "${username}" -- env HOME="$(user_home "${username}")" "$@"
}

render_template() {
    local source_file="$1"
    local destination_file="$2"
    python3 - "${source_file}" "${destination_file}" <<'PY'
import os
import re
import sys
from pathlib import Path

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")
keys = sorted(set(re.findall(r"\{\{([A-Z0-9_]+)\}\}", text)))
missing = [key for key in keys if key not in os.environ]
if missing:
    raise SystemExit(f"Missing template variables: {', '.join(missing)}")
for key in keys:
    text = text.replace("{{" + key + "}}", os.environ[key])
destination.write_text(text, encoding="utf-8")
PY
}

export SERVICE_NAME CONSUMER_SERVICE_NAME APP_DIR APP_USER APP_GROUP VENV_PATH APP_HOST APP_PORT
export UVICORN_WORKERS SERVER_NAME CLIENT_MAX_BODY_SIZE

OLD_COMMIT="$(git -C "${APP_DIR}" rev-parse --short HEAD)"

if ! is_true "${SKIP_GIT_PULL}"; then
    log "Updating ${BRANCH} from origin as ${DEPLOY_USER}"
    run_as_user "${DEPLOY_USER}" git -C "${APP_DIR}" fetch --prune origin "${BRANCH}"
    run_as_user "${DEPLOY_USER}" git -C "${APP_DIR}" checkout "${BRANCH}"
    run_as_user "${DEPLOY_USER}" git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
else
    log "Skipping Git update because SKIP_GIT_PULL=true"
fi

NEW_COMMIT="$(git -C "${APP_DIR}" rev-parse --short HEAD)"
log "Code revision: ${OLD_COMMIT} -> ${NEW_COMMIT}"

log "Securing environment and local database ownership"
chown root:"${APP_GROUP}" "${APP_DIR}/.env"
chmod 0640 "${APP_DIR}/.env"
find "${APP_DIR}" -maxdepth 1 -type f \
    \( -name '*.db' -o -name '*.sqlite3' \) \
    -exec chown "${APP_USER}:${APP_GROUP}" {} \; \
    -exec chmod 0660 {} \;

log "Preparing Python virtual environment"
if [[ ! -x "${VENV_PATH}/bin/python" ]]; then
    run_as_user "${APP_USER}" python3 -m venv "${VENV_PATH}"
fi
run_as_user "${APP_USER}" "${VENV_PATH}/bin/python" -m pip install --upgrade pip
run_as_user "${APP_USER}" "${VENV_PATH}/bin/python" -m pip install -r "${APP_DIR}/requirements.txt"

log "Rendering systemd and Nginx configuration from deployment folder"
render_template \
    "${APP_DIR}/deployment/systemd/vehicle-platform.service.template" \
    "${TMP_SERVICE}"
render_template \
    "${APP_DIR}/deployment/systemd/vehicle-platform-telemetry-consumer.service.template" \
    "${TMP_CONSUMER_SERVICE}"
render_template \
    "${APP_DIR}/deployment/nginx/vehicle-platform.conf.template" \
    "${TMP_NGINX}"

install -m 0644 "${TMP_SERVICE}" "/etc/systemd/system/${SERVICE_NAME}.service"
install -m 0644 "${TMP_CONSUMER_SERVICE}" "/etc/systemd/system/${CONSUMER_SERVICE_NAME}.service"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
install -m 0644 "${TMP_NGINX}" "/etc/nginx/sites-available/${NGINX_SITE_NAME}.conf"
ln -sfn "/etc/nginx/sites-available/${NGINX_SITE_NAME}.conf" \
    "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}.conf"
if is_true "${DISABLE_DEFAULT_NGINX_SITE}"; then
    rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl daemon-reload

log "Applying database migrations"
(
    cd "${APP_DIR}"
    run_as_user "${APP_USER}" "${VENV_PATH}/bin/python" -m alembic upgrade head
)

log "Restarting API (${UVICORN_WORKERS} workers), telemetry consumer, and reloading Nginx"
systemctl enable "${SERVICE_NAME}" >/dev/null
systemctl restart "${SERVICE_NAME}"
systemctl enable "${CONSUMER_SERVICE_NAME}" >/dev/null
systemctl restart "${CONSUMER_SERVICE_NAME}"
systemctl enable --now nginx >/dev/null
systemctl reload nginx

log "Waiting for health check: ${HEALTHCHECK_URL}"
HEALTH_OK=false
for ((attempt = 1; attempt <= HEALTHCHECK_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "${HEALTHCHECK_URL}" >/dev/null; then
        HEALTH_OK=true
        break
    fi
    sleep "${HEALTHCHECK_DELAY_SECONDS}"
done

if [[ "${HEALTH_OK}" != true ]]; then
    systemctl status "${SERVICE_NAME}" --no-pager -l >&2 || true
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager >&2 || true
    die "Health check failed after ${HEALTHCHECK_RETRIES} attempts"
fi

sleep 2
systemctl is-active --quiet "${SERVICE_NAME}"
systemctl is-active --quiet "${CONSUMER_SERVICE_NAME}"
systemctl is-active --quiet nginx

log "Deployment completed successfully"
printf 'API service:      %s\n' "${SERVICE_NAME}"
printf 'API workers:      %s\n' "${UVICORN_WORKERS}"
printf 'Consumer service: %s\n' "${CONSUMER_SERVICE_NAME}"
printf 'Commit:           %s\n' "${NEW_COMMIT}"
printf 'Health:           %s\n' "${HEALTHCHECK_URL}"
printf 'Public:           http://%s\n' "${SERVER_NAME}"
