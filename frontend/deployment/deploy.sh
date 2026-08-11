#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/bnvp-web"
SERVICE_NAME="bnvp-web.service"
NGINX_SITE="bnvp-web"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run with sudo: sudo bash deployment/deploy.sh" >&2
  exit 1
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "Repository not found at ${APP_DIR}. Clone it there first." >&2
  exit 1
fi

if ! id bnvpweb >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /home/bnvpweb --shell /usr/sbin/nologin bnvpweb
fi

cd "${APP_DIR}"

if [[ ! -f .env.production ]]; then
  cp deployment/.env.production.example .env.production
  chmod 600 .env.production
  echo "Created ${APP_DIR}/.env.production from template. Review it before public use."
fi

command -v node >/dev/null 2>&1 || { echo "Node.js is not installed." >&2; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is not installed." >&2; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(`.`)[0]')"
if [[ "${NODE_MAJOR}" != "24" ]]; then
  echo "Node.js 24 is required; found $(node --version)." >&2
  exit 1
fi

chown -R bnvpweb:bnvpweb "${APP_DIR}"

sudo -u bnvpweb -H pnpm install --frozen-lockfile
sudo -u bnvpweb -H pnpm build

install -m 0644 deployment/systemd/bnvp-web.service "/etc/systemd/system/${SERVICE_NAME}"
install -m 0644 deployment/nginx/bnvp-web.conf "/etc/nginx/sites-available/${NGINX_SITE}"
ln -sfn "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

nginx -t
systemctl reload nginx

sleep 2
curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null

echo "Frontend deployment completed successfully."
echo "URL: http://169.58.86.147"
echo "Backend API: http://169.58.78.84/api/v1"
systemctl --no-pager --full status "${SERVICE_NAME}" | sed -n '1,12p'
