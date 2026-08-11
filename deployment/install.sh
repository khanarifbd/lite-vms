#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

[[ ${EUID} -eq 0 ]] || die "Run with sudo: sudo bash deployment/install.sh"

command -v apt-get >/dev/null 2>&1 || die "This installer currently supports Ubuntu/Debian servers. Install Nginx, Python 3, Node.js 24 and pnpm, then run deployment/deploy.sh."

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx python3 python3-pip python3-venv

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.versions.node.split(`.`)[0]')" != "24" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
    apt-get install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
    npm install --global pnpm@11.8.0
fi

if [[ ! -f "${SCRIPT_DIR}/deploy.env" ]]; then
    install -m 0600 "${SCRIPT_DIR}/deploy.env.example" "${SCRIPT_DIR}/deploy.env"
    printf 'Created %s. Review SERVER_NAME and deployment options.\n' "${SCRIPT_DIR}/deploy.env"
fi

if [[ ! -f "${REPO_ROOT}/backend/.env" ]]; then
    install -m 0640 "${SCRIPT_DIR}/backend.env.example" "${REPO_ROOT}/backend/.env"
    printf 'Created %s. Set production database, Kafka, ClickHouse and secrets before deploying.\n' "${REPO_ROOT}/backend/.env" >&2
    exit 2
fi

if [[ ! -f "${REPO_ROOT}/frontend/.env.production" ]]; then
    install -m 0640 "${SCRIPT_DIR}/frontend.env.production.example" "${REPO_ROOT}/frontend/.env.production"
    printf 'Created %s. Set the public domain before deploying.\n' "${REPO_ROOT}/frontend/.env.production" >&2
    exit 2
fi

bash "${SCRIPT_DIR}/deploy.sh"
