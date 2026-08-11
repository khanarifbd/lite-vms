# Production PostgreSQL setup

Run these commands on the live Ubuntu/Debian server before the first application deployment.
PostgreSQL listens locally; do not expose port `5432` through a firewall or Nginx.

```bash
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

In the PostgreSQL prompt, choose a strong, unique password and create the dedicated role
and database. Replace the placeholders before running the commands:

```sql
CREATE ROLE autogeneration_app LOGIN PASSWORD 'REPLACE_WITH_A_STRONG_UNIQUE_PASSWORD';
CREATE DATABASE autogeneration_cms OWNER autogeneration_app;
\q
```

Set the server-only `backend/.env` values. URL-encode reserved password characters such as
`@`, `:`, `/`, `%`, and `#`.

```dotenv
APP_NAME=AutoGeneration LTD CMS Portal
APP_ENV=production
DEBUG=false
DATABASE_URL=postgresql+asyncpg://autogeneration_app:URL_ENCODED_PASSWORD@127.0.0.1:5432/autogeneration_cms
```

Then deploy from the repository root:

```bash
sudo bash deployment/deploy.sh
```

The deployment command runs `alembic upgrade head` before restarting the API. Verify the
database version after the first deployment:

```bash
cd /path/to/lite-vms/backend
sudo -u YOUR_APP_USER .venv/bin/python -m alembic current
sudo -u postgres psql -d autogeneration_cms -c 'SELECT version_num FROM alembic_version;'
```

For this initial production rollout, start with a fresh PostgreSQL database. The local
SQLite file remains untouched and is not imported automatically. If production must retain
its SQLite records, request a reviewed one-time data migration before going live.
