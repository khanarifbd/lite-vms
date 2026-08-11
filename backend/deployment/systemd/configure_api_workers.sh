#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-${DEPLOY_DIR}/deploy.env}"
WORKERS="${1:-2}"

if [[ ${EUID} -ne 0 ]]; then
    printf 'Run with sudo: sudo bash deployment/systemd/configure_api_workers.sh [count]\n' >&2
    exit 1
fi

if [[ ! "${WORKERS}" =~ ^[0-9]+$ ]] || (( WORKERS < 1 )); then
    printf 'Worker count must be a positive integer.\n' >&2
    exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
    printf 'Deployment config not found: %s\n' "${CONFIG_FILE}" >&2
    exit 1
fi

python3 - "${CONFIG_FILE}" "${WORKERS}" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
workers = sys.argv[2]
text = path.read_text(encoding="utf-8")
pattern = re.compile(r"(?m)^UVICORN_WORKERS=.*$")
if pattern.search(text):
    text = pattern.sub(f"UVICORN_WORKERS={workers}", text)
else:
    if text and not text.endswith("\n"):
        text += "\n"
    text += f"UVICORN_WORKERS={workers}\n"
path.write_text(text, encoding="utf-8")
PY

chmod 0640 "${CONFIG_FILE}"
printf 'Configured UVICORN_WORKERS=%s in %s\n' "${WORKERS}" "${CONFIG_FILE}"
printf 'Apply with: sudo bash deployment/deploy.sh\n'
