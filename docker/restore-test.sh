#!/bin/sh
# Does the latest backup actually restore? Restores it into a TEMPORARY database next to the real one,
# compares row counts with the live data, drops the temporary database and reports to Telegram.
# The live database is never touched. Monthly cron (1st day, 04:30):
#   30 4 1 * * cd /opt/My_service && sh docker/restore-test.sh >> backups/restore-test.log 2>&1
set -u
cd "$(dirname "$0")/.."
envget() {
  eval "current=\${$1:-}"
  if [ -n "$current" ]; then printf '%s' "$current"; return; fi
  [ -f .env ] || return 0
  grep -E "^[[:space:]]*$1[[:space:]]*=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
TOKEN="$(envget TELEGRAM_BOT_TOKEN)"; CHAT="$(envget BACKUP_TELEGRAM_CHAT_ID)"
BACKUP_DIR="$(envget BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-./backups}"
send() {
  echo "$1"
  [ -n "$TOKEN" ] && [ -n "$CHAT" ] && curl -fsS -m 20 "https://api.telegram.org/bot${TOKEN}/sendMessage" -d chat_id="$CHAT" --data-urlencode text="$1" >/dev/null 2>&1 || true
}
pg() { docker compose -f docker-compose.prod.yml exec -T postgres "$@"; }
TMP=myservice_restore_test

dump="$(ls -1d "$BACKUP_DIR"/20*/database.dump 2>/dev/null | sort | tail -n 1)"
[ -n "$dump" ] || { send "🔴 Zaxira tekshiruvi: zaxira nusxa topilmadi ($BACKUP_DIR)"; exit 1; }
(cd "$(dirname "$dump")" && sha256sum -c SHA256SUMS >/dev/null 2>&1) || { send "🔴 Zaxira tekshiruvi: $dump checksum mos emas"; exit 1; }

pg dropdb -U myservice --if-exists "$TMP" >/dev/null 2>&1
pg createdb -U myservice "$TMP" || { send "🔴 Zaxira tekshiruvi: vaqtinchalik baza ochilmadi"; exit 1; }
if ! pg pg_restore -U myservice -d "$TMP" --no-owner < "$dump" >/dev/null 2>/tmp/restore-test.err; then
  # pg_restore exits non-zero on warnings too; real failure shows as missing tables below.
  :
fi
count() { pg psql -U myservice -d "$1" -tAc "SELECT (SELECT count(*) FROM \"Organization\")||' servis, '||(SELECT count(*) FROM \"Order\")||' buyurtma, '||(SELECT count(*) FROM \"Payment\")||' to''lov'" 2>/dev/null | tr -d '\r'; }
restored="$(count "$TMP")"; live="$(count myservice)"
pg dropdb -U myservice --if-exists "$TMP" >/dev/null 2>&1
when="$(basename "$(dirname "$dump")")"
if [ -z "$restored" ]; then send "🔴 Zaxira tekshiruvi: $when nusxasi TIKLANMADI. $(head -c 300 /tmp/restore-test.err)"; exit 1; fi
send "🟢 Zaxira tekshiruvi: $when nusxasi tiklandi — $restored (hozir: $live)."
