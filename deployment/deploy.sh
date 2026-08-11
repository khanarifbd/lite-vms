#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-${SCRIPT_DIR}/deploy.env}"

log() { printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
is_true() { case "${1,,}" in true|1|yes|y|on) return 0 ;; *) return 1 ;; esac; }

[[ ${EUID} -eq 0 ]] || die "Run with sudo: sudo bash deployment/deploy.sh"
[[ -f "${CONFIG_FILE}" ]] || die "Missing ${CONFIG_FILE}. Copy deployment/deploy.env.example first."
# shellcheck disable=SC1090
source "${CONFIG_FILE}"

UPDATE_FROM_GIT="${UPDATE_FROM_GIT:-true}"
BRANCH="${BRANCH:-main}"
API_SERVICE_NAME="${API_SERVICE_NAME:-bnvp-api}"
WEB_SERVICE_NAME="${WEB_SERVICE_NAME:-bnvp-web}"
CONSUMER_SERVICE_NAME="${CONSUMER_SERVICE_NAME:-bnvp-telemetry-consumer}"
NGINX_SITE_NAME="${NGINX_SITE_NAME:-bnvp}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8000}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-3000}"
UVICORN_WORKERS="${UVICORN_WORKERS:-2}"
ENABLE_TELEMETRY_CONSUMER="${ENABLE_TELEMETRY_CONSUMER:-false}"
SERVER_NAME="${SERVER_NAME:-_}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-25m}"
DISABLE_DEFAULT_NGINX_SITE="${DISABLE_DEFAULT_NGINX_SITE:-true}"
PNPM_BIN="${PNPM_BIN:-pnpm}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-2}"

for command_name in python3 nginx systemctl curl runuser install mktemp flock getent; do
    command -v "${command_name}" >/dev/null 2>&1 || die "Required command is missing: ${command_name}"
done
command -v "${PNPM_BIN}" >/dev/null 2>&1 || die "pnpm command is missing: ${PNPM_BIN}. Run deployment/install.sh first."
PNPM_BIN="$(command -v "${PNPM_BIN}")"

BACKEND_DIR="${REPO_ROOT}/backend"
FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_ENV_FILE="${BACKEND_DIR}/.env"
FRONTEND_ENV_FILE="${FRONTEND_DIR}/.env.production"
BACKEND_VENV="${BACKEND_DIR}/.venv"
[[ -d "${BACKEND_DIR}" && -d "${FRONTEND_DIR}" ]] || die "Expected backend/ and frontend/ inside ${REPO_ROOT}"
[[ -f "${BACKEND_ENV_FILE}" ]] || die "Missing ${BACKEND_ENV_FILE}; copy deployment/backend.env.example first."
[[ -f "${FRONTEND_ENV_FILE}" ]] || die "Missing ${FRONTEND_ENV_FILE}; copy deployment/frontend.env.production.example first."

DETECTED_OWNER="$(stat -c '%U' "${REPO_ROOT}")"
APP_USER="${APP_USER:-${SUDO_USER:-${DETECTED_OWNER}}}"
id "${APP_USER}" >/dev/null 2>&1 || die "APP_USER does not exist: ${APP_USER}"
APP_GROUP="${APP_GROUP:-$(id -gn "${APP_USER}")}"
getent group "${APP_GROUP}" >/dev/null 2>&1 || die "APP_GROUP does not exist: ${APP_GROUP}"

[[ "${API_PORT}" =~ ^[0-9]+$ && "${WEB_PORT}" =~ ^[0-9]+$ ]] || die "API_PORT and WEB_PORT must be numeric"
[[ "${UVICORN_WORKERS}" =~ ^[0-9]+$ ]] && (( UVICORN_WORKERS >= 1 )) || die "UVICORN_WORKERS must be at least 1"
[[ "${HEALTHCHECK_RETRIES}" =~ ^[0-9]+$ ]] || die "HEALTHCHECK_RETRIES must be numeric"
[[ "${HEALTHCHECK_DELAY_SECONDS}" =~ ^[0-9]+$ ]] || die "HEALTHCHECK_DELAY_SECONDS must be numeric"

user_home() { getent passwd "$1" | cut -d: -f6; }
run_as_app() { runuser -u "${APP_USER}" -- env HOME="$(user_home "${APP_USER}")" "$@"; }

render_template() {
    local source_file="$1" destination_file="$2"
    python3 - "${source_file}" "${destination_file}" <<'PY'
import os
import re
import sys
from pathlib import Path

source, destination = map(Path, sys.argv[1:])
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

exec 9>"/var/lock/${NGINX_SITE_NAME}.deploy.lock"
flock -n 9 || die "Another deployment is already running"
TMP_API="$(mktemp)"; TMP_WEB="$(mktemp)"; TMP_CONSUMER="$(mktemp)"; TMP_NGINX="$(mktemp)"
trap 'rm -f "${TMP_API}" "${TMP_WEB}" "${TMP_CONSUMER}" "${TMP_NGINX}"' EXIT

if is_true "${UPDATE_FROM_GIT}"; then
    [[ -d "${REPO_ROOT}/.git" ]] || die "UPDATE_FROM_GIT=true but ${REPO_ROOT} is not a Git repository"
    log "Updating ${BRANCH} from Git"
    run_as_app git -C "${REPO_ROOT}" fetch --prune origin "${BRANCH}"
    run_as_app git -C "${REPO_ROOT}" checkout "${BRANCH}"
    run_as_app git -C "${REPO_ROOT}" reset --hard "origin/${BRANCH}"
fi

# .env files are intentionally outside the Git checkout behavior and remain on the server.
chown root:"${APP_GROUP}" "${BACKEND_ENV_FILE}" "${FRONTEND_ENV_FILE}"
chmod 0640 "${BACKEND_ENV_FILE}" "${FRONTEND_ENV_FILE}"
chown -R "${APP_USER}:${APP_GROUP}" "${BACKEND_DIR}" "${FRONTEND_DIR}"
chown root:"${APP_GROUP}" "${BACKEND_ENV_FILE}" "${FRONTEND_ENV_FILE}"

log "Installing backend dependencies"
if [[ ! -x "${BACKEND_VENV}/bin/python" ]]; then
    run_as_app python3 -m venv "${BACKEND_VENV}"
fi
run_as_app "${BACKEND_VENV}/bin/python" -m pip install --upgrade pip
run_as_app "${BACKEND_VENV}/bin/python" -m pip install -r "${BACKEND_DIR}/requirements.txt"
run_as_app bash -c "cd '${BACKEND_DIR}' && '${BACKEND_VENV}/bin/python' -c \"from app.core.config import settings; assert settings.database_url.startswith('postgresql+asyncpg://'), 'Production DATABASE_URL must use postgresql+asyncpg://'\""

log "Building frontend"
run_as_app "${PNPM_BIN}" --dir "${FRONTEND_DIR}" install --frozen-lockfile
run_as_app "${PNPM_BIN}" --dir "${FRONTEND_DIR}" build

export API_SERVICE_NAME WEB_SERVICE_NAME CONSUMER_SERVICE_NAME APP_USER APP_GROUP
export BACKEND_DIR FRONTEND_DIR BACKEND_ENV_FILE FRONTEND_ENV_FILE BACKEND_VENV
export API_HOST API_PORT WEB_HOST WEB_PORT UVICORN_WORKERS PNPM_BIN SERVER_NAME CLIENT_MAX_BODY_SIZE
render_template "${SCRIPT_DIR}/systemd/bnvp-api.service.template" "${TMP_API}"
render_template "${SCRIPT_DIR}/systemd/bnvp-web.service.template" "${TMP_WEB}"
render_template "${SCRIPT_DIR}/systemd/bnvp-telemetry-consumer.service.template" "${TMP_CONSUMER}"
render_template "${SCRIPT_DIR}/nginx/bnvp.conf.template" "${TMP_NGINX}"

install -m 0644 "${TMP_API}" "/etc/systemd/system/${API_SERVICE_NAME}.service"
install -m 0644 "${TMP_WEB}" "/etc/systemd/system/${WEB_SERVICE_NAME}.service"
install -m 0644 "${TMP_CONSUMER}" "/etc/systemd/system/${CONSUMER_SERVICE_NAME}.service"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
install -m 0644 "${TMP_NGINX}" "/etc/nginx/sites-available/${NGINX_SITE_NAME}.conf"
ln -sfn "/etc/nginx/sites-available/${NGINX_SITE_NAME}.conf" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}.conf"
if is_true "${DISABLE_DEFAULT_NGINX_SITE}"; then rm -f /etc/nginx/sites-enabled/default; fi

nginx -t
systemctl daemon-reload

log "Stopping API before database migration"
systemctl stop "${API_SERVICE_NAME}" || true
log "Applying Alembic migrations"
( cd "${BACKEND_DIR}" && run_as_app "${BACKEND_VENV}/bin/python" -m alembic upgrade head )

log "Restarting API, frontend and Nginx"
systemctl enable "${API_SERVICE_NAME}" "${WEB_SERVICE_NAME}" >/dev/null
systemctl restart "${API_SERVICE_NAME}"
if is_true "${ENABLE_TELEMETRY_CONSUMER}"; then
    systemctl enable "${CONSUMER_SERVICE_NAME}" >/dev/null
    systemctl restart "${CONSUMER_SERVICE_NAME}"
else
    systemctl disable --now "${CONSUMER_SERVICE_NAME}" >/dev/null 2>&1 || true
fi
systemctl restart "${WEB_SERVICE_NAME}"
systemctl enable --now nginx >/dev/null
systemctl reload nginx

log "Waiting for API and frontend health checks"
for ((attempt = 1; attempt <= HEALTHCHECK_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "http://${API_HOST}:${API_PORT}/health" >/dev/null && curl --fail --silent --show-error --max-time 5 "http://${WEB_HOST}:${WEB_PORT}/" >/dev/null; then
        systemctl is-active --quiet "${API_SERVICE_NAME}"
        if is_true "${ENABLE_TELEMETRY_CONSUMER}"; then
            systemctl is-active --quiet "${CONSUMER_SERVICE_NAME}"
        fi
        systemctl is-active --quiet "${WEB_SERVICE_NAME}"
        systemctl is-active --quiet nginx
        log "Deployment completed successfully"
        printf 'Public URL: http://%s\n' "${SERVER_NAME}"
        exit 0
    fi
    sleep "${HEALTHCHECK_DELAY_SECONDS}"
done

systemctl status "${API_SERVICE_NAME}" "${CONSUMER_SERVICE_NAME}" "${WEB_SERVICE_NAME}" --no-pager -l || true
journalctl -u "${API_SERVICE_NAME}" -u "${WEB_SERVICE_NAME}" -n 80 --no-pager || true
die "Health check failed"
