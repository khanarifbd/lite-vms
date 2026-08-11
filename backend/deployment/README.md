# Production deployment

This folder is the source of truth for the live systemd and Nginx configuration.
Every deployment re-renders and installs both configurations before restarting the API.

## Files

```text
deployment/
├── deploy.sh
├── install.sh
├── deploy.env.example
├── deploy.env                 # live-only, ignored by Git
├── systemd/
│   └── vehicle-platform.service.template
└── nginx/
    └── vehicle-platform.conf.template
```

## First setup on the server

From the repository root:

```bash
cp deployment/deploy.env.example deployment/deploy.env
nano deployment/deploy.env
sudo bash deployment/install.sh
```

`install.sh` installs Git, Nginx, curl, Python, pip and venv packages on Ubuntu/Debian.
It does not overwrite an existing application `.env` file.
If `.env` is missing, it creates one from `.env.example`, stops, and asks for production secrets and database settings.

Important configuration values:

```text
APP_DIR          absolute repository path; empty uses the current repository
DEPLOY_USER      user whose Git/SSH credentials can pull the private repository
APP_USER         Linux user that runs Uvicorn
SERVER_NAME      public IP address or domain
UVICORN_WORKERS  keep 1 while SQLite is used
```

The private repository must already be accessible to `DEPLOY_USER` through its SSH key or Git credentials.

## Every future release: one command

```bash
sudo bash deployment/deploy.sh
```

The command performs these steps in order:

```text
lock deployment
fetch origin/main
reset the live checkout to origin/main
create/reuse .venv
install requirements.txt
render and install the systemd service
render and install the Nginx site
validate Nginx configuration
run Alembic migrations
restart and enable the API service
reload and enable Nginx
wait for /health
print the deployed commit
```

The script uses `git reset --hard origin/main`. Do not make production code edits directly on the server.
Keep server-only settings in `.env` and `deployment/deploy.env`; both are ignored by Git.

## Status and logs

```bash
sudo systemctl status vehicle-platform --no-pager -l
sudo journalctl -u vehicle-platform -n 100 --no-pager
sudo nginx -t
```

Live health and Swagger:

```text
http://169.58.78.84/health
http://169.58.78.84/docs
```

## Configuration updates

Change the repository templates, review and merge them to `main`, then run the normal one-command deployment.

```text
systemd change → deployment/systemd/vehicle-platform.service.template
Nginx change   → deployment/nginx/vehicle-platform.conf.template
server values  → deployment/deploy.env on the live server
app secrets    → .env on the live server
```

The deploy command always reinstalls the latest service and Nginx templates, so configuration changes go live together with application code.
