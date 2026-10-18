#!/bin/sh
# Restore a dump made by docker/backup.sh into the running PostgreSQL. DESTROYS the current data.
#   sh docker/restore.sh backups/20261019T031500Z/database.dump
set -eu
cd "$(dirname "$0")/.."
dump="${1:?usage: sh docker/restore.sh <path/to/database.dump>}"
[ -f "$dump" ] || { echo "no such file: $dump"; exit 1; }
sums="$(dirname "$dump")/SHA256SUMS"
if [ -f "$sums" ]; then (cd "$(dirname "$dump")" && sha256sum -c SHA256SUMS) || { echo "checksum mismatch"; exit 1; }; fi
printf "Bu hozirgi ma'lumotlarni O'CHIRIB, %s dan tiklaydi. Davom etish uchun RESTORE deb yozing: " "$dump"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "bekor qilindi"; exit 1; }
docker compose -f docker-compose.prod.yml stop api web
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U myservice -d myservice --clean --if-exists --no-owner < "$dump"
docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate
docker compose -f docker-compose.prod.yml up -d api web
echo "tiklandi. Eski buyurtma va uning chekini ochib tekshiring."
