#!/bin/sh
# Daily PostgreSQL backup: a custom-format dump with its checksum, kept KEEP_DAYS days locally and
# copied off the server (to a Telegram chat and/or an rclone remote). All business data is in PostgreSQL.
#
#   cron (every night at 03:15):  15 3 * * * cd ~/My_service && sh docker/backup.sh >> backups/backup.log 2>&1
#
# Settings (from .env or the environment):
#   BACKUP_DIR              where dumps go (default: ./backups)
#   KEEP_DAYS               local days to keep (default: 14)
#   BACKUP_TELEGRAM_CHAT_ID send each dump to this Telegram chat (your own chat id), via TELEGRAM_BOT_TOKEN
#   BACKUP_RCLONE_REMOTE    e.g. "b2:myservice-backups" if rclone is installed and configured
set -eu
cd "$(dirname "$0")/.."

# Read one value from .env without executing the file: it may have Windows line endings, spaces or
# quotes that a shell would choke on. A variable already set in the environment wins.
envget() {
  eval "current=\${$1:-}"
  if [ -n "$current" ]; then printf '%s' "$current"; return; fi
  [ -f .env ] || return 0
  grep -E "^[[:space:]]*$1[[:space:]]*=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
TELEGRAM_BOT_TOKEN="$(envget TELEGRAM_BOT_TOKEN)"
BACKUP_TELEGRAM_CHAT_ID="$(envget BACKUP_TELEGRAM_CHAT_ID)"
BACKUP_RCLONE_REMOTE="$(envget BACKUP_RCLONE_REMOTE)"
BACKUP_DIR="$(envget BACKUP_DIR)"; BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="$(envget KEEP_DAYS)"; KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dir="$BACKUP_DIR/$stamp"
umask 077
mkdir -p "$dir"

alert() {
  # Best effort: tell the platform owner in Telegram that the backup failed.
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${BACKUP_TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 30 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="$BACKUP_TELEGRAM_CHAT_ID" --data-urlencode text="⚠️ MyService zaxira nusxasi OLINMADI ($stamp): $1" >/dev/null || true
  fi
}
trap 'alert "skript xato bilan tugadi"' EXIT

docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U myservice -d myservice -Fc > "$dir/database.dump"
size=$(wc -c < "$dir/database.dump")
[ "$size" -gt 1000 ] || { alert "dump juda kichik ($size bayt)"; trap - EXIT; exit 1; }
(cd "$dir" && sha256sum database.dump > SHA256SUMS)
echo "$(date -u) backup ok: $dir ($size bytes)"

# Off the server: Telegram (files up to 50 MB) and/or rclone.
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${BACKUP_TELEGRAM_CHAT_ID:-}" ]; then
  if [ "$size" -lt 50000000 ]; then
    curl -fsS -m 300 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
      -F chat_id="$BACKUP_TELEGRAM_CHAT_ID" -F caption="MyService zaxira $stamp ($((size / 1024)) KB)" \
      -F document=@"$dir/database.dump;filename=myservice-$stamp.dump" >/dev/null && echo "sent to Telegram" || alert "Telegramga yuborilmadi"
  else
    alert "fayl 50 MB dan katta, Telegramga sig'maydi — BACKUP_RCLONE_REMOTE sozlang"
  fi
fi
if [ -n "${BACKUP_RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$dir" "$BACKUP_RCLONE_REMOTE/$stamp" && echo "copied to $BACKUP_RCLONE_REMOTE" || alert "rclone nusxalamadi"
fi

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf -- {} +
trap - EXIT
