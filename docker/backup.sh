#!/bin/sh
set -eu
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$BACKUP_DIR/$stamp"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U myservice -d myservice -Fc > "$BACKUP_DIR/$stamp/database.dump"
docker compose -f docker-compose.prod.yml exec -T minio sh -c 'tar -C /data -czf - .' > "$BACKUP_DIR/$stamp/storage.tar.gz"
sha256sum "$BACKUP_DIR/$stamp/database.dump" "$BACKUP_DIR/$stamp/storage.tar.gz" > "$BACKUP_DIR/$stamp/SHA256SUMS"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf -- {} +
