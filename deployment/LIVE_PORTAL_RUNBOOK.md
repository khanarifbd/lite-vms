# Live portal deployment runbook

Target application URL: `https://portal.autogenerationbd.com`

Target server IP: `169.58.138.200`

## 1. Configure DNS first

At the DNS provider for `autogenerationbd.com`, create this record:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A | `portal` | `169.58.138.200` | 300 |

Wait until this command returns the target IP before requesting a certificate:

```bash
dig +short portal.autogenerationbd.com A
```

## 2. Open only required firewall ports

On the server, allow SSH, HTTP and HTTPS. Keep PostgreSQL, FastAPI, and Next.js private.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 3. Create production environment files

Clone this repository on the server, then copy the examples to private files:

```bash
cd /path/to/lite-vms
cp deployment/deploy.env.example deployment/deploy.env
cp deployment/backend.env.example backend/.env
cp deployment/frontend.env.production.example frontend/.env.production
chmod 640 backend/.env frontend/.env.production
chmod 600 deployment/deploy.env
```

Set a strong PostgreSQL password and JWT secret in `backend/.env`. Do not commit these files.

## 4. Install PostgreSQL and deploy

Create the PostgreSQL role/database using [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md), then run:

```bash
sudo bash deployment/install.sh
```

This builds both applications, applies `alembic upgrade head`, and starts Nginx, FastAPI,
and Next.js through systemd.

## 5. Enable HTTPS after DNS resolves

```bash
sudo apt-get update
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/lib/bnvp-certbot -d portal.autogenerationbd.com
```

Set `TLS_ENABLED=true` in `deployment/deploy.env`, then run `sudo bash deployment/deploy.sh`
once more. This activates the committed HTTPS configuration and retains it through every
future deployment.

Verify automatic certificate renewal:

```bash
sudo certbot renew --dry-run
```

## 6. Verify live service

```bash
curl -I https://portal.autogenerationbd.com
curl -fsS https://portal.autogenerationbd.com/health
sudo systemctl status bnvp-api bnvp-web nginx --no-pager
```
