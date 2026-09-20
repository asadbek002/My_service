# Production deployment

This repository contains a single-host Docker Compose baseline. It is not a substitute for the production operator choosing a domain, SMS provider, backup destination and secret manager.

1. Provision a supported Linux host, DNS and firewall. Expose only 80/443; keep PostgreSQL, Redis and MinIO private.
2. Create .env from .env.example. Generate independent random secrets. Set production URLs, PostgreSQL/Redis passwords and S3 credentials.
3. Build with docker compose -f docker-compose.prod.yml build.
4. Run migrations as a one-off job: docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate.
5. Seed the first platform administrator with INITIAL_PLATFORM_ADMIN_LOGIN/PASSWORD and the seed:platform script. Remove those values after the account exists.
6. Start services. Put the nginx service behind your TLS/Let's Encrypt termination or mount your managed certificate configuration.
7. Configure Telegram webhook with /api/telegram/webhook and the secret token. Configure and test the SMS adapter before NOTIFICATIONS_ENABLED=true.
8. Verify /api/health, platform system status, one test notification and a full acceptance order.

## Backups

Run docker/backup.sh from a restricted scheduler. BACKUP_DIR must be an encrypted volume that is copied off-host. The script creates a PostgreSQL custom dump, object-storage archive and checksums, and removes local daily sets older than 30 days. Implement weekly/monthly off-host retention at the backup destination.

A restore drill is mandatory:
- stop API/workers;
- verify SHA256SUMS;
- restore database.dump into an empty PostgreSQL database with pg_restore;
- restore storage.tar.gz into an empty MinIO volume;
- apply migrations;
- start services and test a historical order, attachment and document;
- record duration and outcome.

Never treat an untested backup as recoverable. Database and object storage must be restored from the same backup set.

## Operations

Monitor container restarts, /api/health, PostgreSQL space, Redis persistence, MinIO space, pending outbox and failed notifications. Alert on 5xx rate, repeated login limits, refresh-token reuse and backup failures. Structured JSON logs and external metrics/error reporting are the remaining infrastructure integration point.
