#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

[[ ${EUID} -eq 0 ]] || fail "Run this command with sudo: sudo bash deployment/install.sh"

if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y git nginx curl python3 python3-venv python3-pip
else
    for command_name in git nginx curl python3; do
        command -v "${command_name}" >/dev/null 2>&1 || \
            fail "Install ${command_name} before running this script"
    done
fi

if [[ ! -f "${SCRIPT_DIR}/deploy.env" ]]; then
    cp "${SCRIPT_DIR}/deploy.env.example" "${SCRIPT_DIR}/deploy.env"
    chmod 600 "${SCRIPT_DIR}/deploy.env"
    printf 'Created %s\n' "${SCRIPT_DIR}/deploy.env"
fi

if [[ ! -f "${REPO_ROOT}/.env" ]]; then
    cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
    chmod 600 "${REPO_ROOT}/.env"
    cat <<EOF

Created ${REPO_ROOT}/.env from .env.example.
Edit the production database, JWT secret, CORS, registration policy and admin values first:

  sudo nano ${REPO_ROOT}/.env

Then run this installer again.
EOF
    exit 2
fi

bash "${SCRIPT_DIR}/deploy.sh"
