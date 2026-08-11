# Bangladesh National Vehicle Platform — Native Server Setup

This guide describes the complete setup for a fresh Ubuntu 24.04 server without Docker.

## Architecture

- FastAPI + Uvicorn application
- PostgreSQL for business and relational data
- Apache Kafka in KRaft mode for telemetry ingestion
- Nginx reverse proxy
- systemd services for the API and Kafka
- Alembic database migrations

The example installation path is `/opt/bnvp` and the API listens internally on `127.0.0.1:8000`.

---

## Step 1 — Update the server

```bash
sudo apt update
sudo apt upgrade -y
```

Install common tools:

```bash
sudo apt install -y \
  git curl wget nginx \
  python3 python3-venv python3-dev build-essential \
  postgresql postgresql-contrib \
  openjdk-21-jre-headless \
  liblz4-1 liblz4-dev
```

Verify Java and Python:

```bash
java -version
python3 --version
```

A pending kernel upgrade does not block the application setup. Reboot later during a safe maintenance window.

---

## Step 2 — Clone the repository

```bash
cd /opt
git clone git@github.com:arifxpartbd/bangladesh-national-vehicle-platform.git bnvp
cd /opt/bnvp
git checkout main
```

For a private repository, configure the server SSH key or another approved GitHub authentication method before cloning.

---

## Step 3 — Create the Python virtual environment

```bash
cd /opt/bnvp
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Verify Kafka compression dependencies:

```bash
python -c "import cramjam; from aiokafka.codec import has_lz4; print('aiokafka has_lz4:', has_lz4())"
```

Expected output:

```text
aiokafka has_lz4: True
```

---

## Step 4 — Configure PostgreSQL

Start and enable PostgreSQL:

```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql --no-pager
```

Create the database and application user. Replace the placeholder password with a strong unique password:

```bash
sudo -u postgres psql
```

Inside PostgreSQL:

```sql
CREATE USER bnvp_user_arif WITH PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
CREATE DATABASE bnvp_db OWNER bnvp_user_arif;
GRANT ALL PRIVILEGES ON DATABASE bnvp_db TO bnvp_user_arif;
\q
```

Test the connection:

```bash
psql -h 127.0.0.1 -U bnvp_user_arif -d bnvp_db
```

Exit with:

```sql
\q
```

---

## Step 5 — Configure the application environment

Create the production environment file:

```bash
cd /opt/bnvp
cp .env.example .env
nano .env
```

Important production values include:

```dotenv
APP_ENV=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://bnvp_user_arif:URL_ENCODED_PASSWORD@127.0.0.1:5432/bnvp_db
KAFKA_BOOTSTRAP_SERVERS=127.0.0.1:9092
KAFKA_TELEMETRY_TOPIC=vehicle-telemetry
```

Use a long random JWT secret. Do not reuse credentials shown in screenshots, terminal history, chat, or documentation.

When a database password contains reserved URL characters such as `@`, `:`, `/`, `%`, or `#`, URL-encode it in `DATABASE_URL`.

Secure the file:

```bash
sudo chown root:root /opt/bnvp/.env
sudo chmod 640 /opt/bnvp/.env
```

---

## Step 6 — Apply database migrations

```bash
cd /opt/bnvp
source .venv/bin/activate
alembic upgrade head
alembic current
```

Verify tables when needed:

```bash
psql -h 127.0.0.1 -U bnvp_user_arif -d bnvp_db
```

Inside PostgreSQL:

```sql
\dt
SELECT * FROM alembic_version;
\q
```

---

## Step 7 — Install Apache Kafka in KRaft mode

The commands below use the tested package name `kafka_2.13-4.3.1`. When intentionally upgrading Kafka, update the version consistently in all commands and validate it in staging first.

Download and install:

```bash
cd /opt
sudo wget https://downloads.apache.org/kafka/4.3.1/kafka_2.13-4.3.1.tgz
sudo tar -xzf kafka_2.13-4.3.1.tgz
sudo mv kafka_2.13-4.3.1 kafka
sudo rm kafka_2.13-4.3.1.tgz
```

Create the data directory:

```bash
sudo mkdir -p /var/lib/kafka/data
sudo chown -R root:root /opt/kafka /var/lib/kafka
```

Set the Kafka log directory:

```bash
sudo sed -i 's|^log.dirs=.*|log.dirs=/var/lib/kafka/data|' /opt/kafka/config/server.properties
```

Generate a KRaft cluster ID and format storage. Run this only for a new Kafka installation. Do not reformat an existing production data directory.

```bash
KAFKA_CLUSTER_ID=$(/opt/kafka/bin/kafka-storage.sh random-uuid)
echo "$KAFKA_CLUSTER_ID"

sudo /opt/kafka/bin/kafka-storage.sh format \
  --standalone \
  -t "$KAFKA_CLUSTER_ID" \
  -c /opt/kafka/config/server.properties
```

---

## Step 8 — Create the Kafka systemd service

Create the service:

```bash
sudo nano /etc/systemd/system/kafka.service
```

Paste:

```ini
[Unit]
Description=Apache Kafka Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/opt/kafka/bin/kafka-server-start.sh /opt/kafka/config/server.properties
ExecStop=/opt/kafka/bin/kafka-server-stop.sh
Restart=on-failure
RestartSec=5
LimitNOFILE=100000

[Install]
WantedBy=multi-user.target
```

Enable and start Kafka:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kafka.service
sleep 5
sudo systemctl status kafka.service --no-pager -l
```

Verify port 9092:

```bash
ss -lntp | grep 9092
```

View Kafka logs:

```bash
sudo journalctl -u kafka.service -n 100 --no-pager
```

---

## Step 9 — Create the telemetry topic

Create the topic once Kafka is running:

```bash
sudo /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server 127.0.0.1:9092 \
  --create \
  --if-not-exists \
  --topic vehicle-telemetry \
  --partitions 6 \
  --replication-factor 1
```

List topics:

```bash
sudo /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server 127.0.0.1:9092 \
  --list
```

Describe the topic:

```bash
sudo /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server 127.0.0.1:9092 \
  --describe \
  --topic vehicle-telemetry
```

A single-node test server must use replication factor `1`. A production Kafka cluster should use multiple brokers and an appropriate replication factor.

---

## Step 10 — Configure deployment settings

Create the local deployment configuration:

```bash
cd /opt/bnvp
cp deployment/deploy.env.example deployment/deploy.env
nano deployment/deploy.env
```

Example:

```dotenv
BRANCH=main
SERVICE_NAME=bnvp-api
NGINX_SITE_NAME=bnvp-api
APP_DIR=/opt/bnvp
DEPLOY_USER=root
APP_USER=root
APP_GROUP=root
VENV_DIR=.venv
APP_HOST=127.0.0.1
APP_PORT=8000
UVICORN_WORKERS=1
SERVER_NAME=YOUR_DOMAIN_OR_SERVER_IP
CLIENT_MAX_BODY_SIZE=25m
DISABLE_DEFAULT_NGINX_SITE=true
HEALTHCHECK_URL=http://127.0.0.1:8000/health
HEALTHCHECK_RETRIES=30
HEALTHCHECK_DELAY_SECONDS=2
SKIP_GIT_PULL=false
```

`deployment/deploy.env` is ignored by Git and should remain server-specific.

---

## Step 11 — Run the deployment

The deployment script performs these actions:

1. Pulls and resets to the configured Git branch.
2. Secures the `.env` file.
3. Creates or updates the Python virtual environment.
4. Installs `requirements.txt`.
5. Renders the systemd and Nginx templates.
6. Applies Alembic migrations.
7. Restarts the API and reloads Nginx.
8. Waits for the health check.

Run:

```bash
cd /opt/bnvp
sudo bash deployment/deploy.sh
```

After the first setup, this is the normal deployment command for future releases.

---

## Step 12 — Verify all services

Kafka:

```bash
sudo systemctl status kafka.service --no-pager -l
ss -lntp | grep 9092
```

API:

```bash
sudo systemctl status bnvp-api.service --no-pager -l
curl -i http://127.0.0.1:8000/health
```

Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager -l
```

OpenAPI and telemetry endpoint:

```bash
curl -s http://127.0.0.1:8000/openapi.json \
  | grep -o '"/api/v1/telemetry[^\"]*"'
```

---

## Step 13 — Common logs and troubleshooting

API logs:

```bash
sudo journalctl -u bnvp-api.service -n 100 --no-pager
sudo journalctl -u bnvp-api.service -f
```

Kafka logs:

```bash
sudo journalctl -u kafka.service -n 100 --no-pager
sudo journalctl -u kafka.service -f
```

Nginx logs:

```bash
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

### `Compression library for lz4 not found`

Verify `cramjam`, not only the Python `lz4` package:

```bash
cd /opt/bnvp
source .venv/bin/activate
python -m pip install -r requirements.txt
python -c "import cramjam; from aiokafka.codec import has_lz4; print(has_lz4())"
```

Expected result: `True`.

### `KafkaConnectionError: Unable to bootstrap from localhost:9092`

```bash
sudo systemctl status kafka.service --no-pager -l
ss -lntp | grep 9092
sudo journalctl -u kafka.service -n 100 --no-pager
```

### API service is in an auto-restart loop

```bash
sudo systemctl status bnvp-api.service --no-pager -l
sudo journalctl -u bnvp-api.service -n 100 --no-pager
```

### Health check cannot connect to port 8000

The API has usually failed during application startup. Inspect the API journal before changing Nginx.

---

## Step 14 — Routine update workflow

For every normal release:

```bash
cd /opt/bnvp
sudo bash deployment/deploy.sh
```

Final checks:

```bash
sudo systemctl is-active kafka.service
sudo systemctl is-active bnvp-api.service
sudo systemctl is-active nginx
curl -i http://127.0.0.1:8000/health
```

All commands should report active services and a successful health response.

---

## Security checklist before public production

- Set `APP_ENV=production` and `DEBUG=false`.
- Disable automatic public registration activation unless explicitly required.
- Rotate every password or secret exposed in screenshots, logs, shell history, or chat.
- Use strong unique PostgreSQL and JWT credentials.
- Keep PostgreSQL, Kafka controller, Kafka broker, and Uvicorn ports private unless an architecture review explicitly requires external access.
- Expose the application through Nginx with HTTPS.
- Restrict the firewall to required ports only.
- Back up PostgreSQL and `/var/lib/kafka` according to the retention and recovery plan.
- Test upgrades and migrations on a non-production server first.
