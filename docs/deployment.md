# Production deployment

This repository contains a single-host Docker Compose baseline. It is not a substitute for the production operator choosing a domain, SMS provider, backup destination and secret manager.

1. Provision a supported Linux host, DNS and firewall. Expose only 80/443; keep PostgreSQL and Redis private.
2. Create .env from .env.example. Generate independent random secrets. Set production URLs and PostgreSQL/Redis passwords.
3. Build with docker compose -f docker-compose.prod.yml build.
4. Run migrations as a one-off job: docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate.
5. Seed the first platform administrator with INITIAL_PLATFORM_ADMIN_LOGIN/PASSWORD and the seed:platform script. Remove those values after the account exists.
6. Start services. Put the nginx service behind your TLS/Let's Encrypt termination or mount your managed certificate configuration.
7. Configure Telegram webhook with /api/telegram/webhook and the secret token. Configure and test the SMS adapter before NOTIFICATIONS_ENABLED=true.
8. Verify /api/health, platform system status, one test notification and a full acceptance order.

## Backups

Run docker/backup.sh from a restricted scheduler. BACKUP_DIR must be an encrypted volume that is copied off-host. The script creates a PostgreSQL custom dump and checksums (all data lives in PostgreSQL), and removes local daily sets older than 30 days. Implement weekly/monthly off-host retention at the backup destination.

A restore drill is mandatory:
- stop API/workers;
- verify SHA256SUMS;
- restore database.dump into an empty PostgreSQL database with pg_restore;
- apply migrations;
- start services and test a historical order and its receipt;
- record duration and outcome.

Never treat an untested backup as recoverable.

## Operations

Monitor container restarts, /api/health, PostgreSQL space, Redis persistence, pending outbox and failed notifications. Alert on 5xx rate, repeated login limits, refresh-token reuse and backup failures. Structured JSON logs and external metrics/error reporting are the remaining infrastructure integration point.

## Updating an existing server

```sh
cd /root/My_service && git pull
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate
```

`--remove-orphans` also stops the old `minio` container, which is no longer used; its volume can be deleted with `docker volume ls` / `docker volume rm` once you are sure nothing else needs it.

## Telegram from Docker

On some servers containers cannot reach `api.telegram.org` while the host can. The production API therefore runs with `network_mode: host`: it listens on `127.0.0.1:3004` (host nginx proxies to it) and reaches PostgreSQL and Redis on loopback ports `127.0.0.1:5432` / `127.0.0.1:6379`; the names `postgres` and `redis` in `DATABASE_URL`/`REDIS_URL` resolve to 127.0.0.1. Nothing else on the host may use ports 5432, 6379 or 3004.
