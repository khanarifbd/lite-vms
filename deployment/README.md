# One-server deployment

This folder deploys the complete application from this repository on one Ubuntu/Debian server:

```text
Internet → Nginx (:80) → Next.js frontend (:3000, private)
                       → FastAPI backend (:8000, private)
```

Nginx serves the frontend at `/` and forwards `/api/`, `/health`, `/docs`, and `/openapi.json` to the backend. The API, frontend, and Nginx are systemd services and automatically restart after a reboot or failure. The Kafka/ClickHouse telemetry module is disabled by default.

## First server setup

Clone this repository on the server, then run:

```bash
cd /path/to/lite-vms
sudo bash deployment/install.sh
```

The installer installs Nginx, Python, Node.js 24 and pnpm, then creates these private files when missing:

```text
deployment/deploy.env
backend/.env
frontend/.env.production
```

Edit the generated files before running the installer again. At minimum, set `SERVER_NAME`, the public URLs, database credentials, a strong `JWT_SECRET_KEY`, and SMS settings. Kafka/ClickHouse are not required while telemetry is disabled.

## Enabling telemetry later

When Kafka and ClickHouse are ready, set both of these values and run the normal deploy command:

```text
backend/.env: TELEMETRY_ENABLED=true
deployment/deploy.env: ENABLE_TELEMETRY_CONSUMER=true
```

This enables the `/api/v1/telemetry` endpoint, Kafka producer, and ClickHouse telemetry consumer without restoring or changing code.

## Every deployment: one command

```bash
cd /path/to/lite-vms
sudo bash deployment/deploy.sh
```

With `UPDATE_FROM_GIT=true` (the default), this fetches `origin/main`, resets the server checkout to that revision, installs backend/frontend dependencies, builds Next.js, validates Nginx, runs `alembic upgrade head`, and restarts all services. Do not make code edits directly on that server checkout. Set `UPDATE_FROM_GIT=false` only if another release mechanism has already placed the code there.

## Useful checks

```bash
sudo systemctl status bnvp-api bnvp-web bnvp-telemetry-consumer nginx --no-pager
sudo journalctl -u bnvp-api -u bnvp-web -n 100 --no-pager
sudo nginx -t
```
