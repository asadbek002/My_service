#!/bin/sh
# Is MyService up? Checks the API and the web app; on the 2nd failure in a row sends a Telegram alert,
# and one more when it is back. Meant for cron every 5 minutes.
#
# On the server itself (checks 127.0.0.1, reads the bot token and chat from .env):
#   */5 * * * * cd /opt/My_service && sh docker/uptime.sh >/dev/null 2>&1
# From ANOTHER machine (catches power / internet / IP outages of the server), e.g. the old VPS:
#   */5 * * * * TELEGRAM_BOT_TOKEN=... ALERT_CHAT_ID=... CHECK_URLS="https://myserviceuz.uz/api/health https://myserviceuz.uz/login" sh /root/uptime.sh
cd "$(dirname "$0")/.." 2>/dev/null || true
envget() {
  eval "current=\${$1:-}"
  if [ -n "$current" ]; then printf '%s' "$current"; return; fi
  [ -f .env ] || return 0
  grep -E "^[[:space:]]*$1[[:space:]]*=" .env | tail -n 1 | cut -d= -f2- | tr -d '\r' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}
TOKEN="$(envget TELEGRAM_BOT_TOKEN)"
CHAT="$(envget ALERT_CHAT_ID)"; CHAT="${CHAT:-$(envget BACKUP_TELEGRAM_CHAT_ID)}"
URLS="${CHECK_URLS:-http://127.0.0.1:3004/api/health http://127.0.0.1:3003/login}"
STATE="${UPTIME_STATE:-/tmp/myservice-uptime.state}"

send() {
  [ -n "$TOKEN" ] && [ -n "$CHAT" ] || { echo "$1"; return; }
  curl -fsS -m 20 "https://api.telegram.org/bot${TOKEN}/sendMessage" -d chat_id="$CHAT" --data-urlencode text="$1" >/dev/null 2>&1 || echo "$1"
}

bad=""
for url in $URLS; do
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$url" || true)"
  [ "$code" = "200" ] || bad="$bad $url ($code)"
done

prev="$(cat "$STATE" 2>/dev/null || echo 0)"
if [ -n "$bad" ]; then
  n=$((prev + 1)); echo "$n" > "$STATE"
  # Alert on the 2nd failed check in a row (one slow answer is not an outage), then every hour while down.
  if [ "$n" -eq 2 ] || [ $((n % 12)) -eq 2 ]; then send "🔴 MyService ishlamayapti ($(hostname)):$bad"; fi
  exit 1
fi
[ "$prev" -ge 2 ] && send "🟢 MyService yana ishlayapti ($(hostname)), $((prev * 5)) daqiqacha uzilish."
echo 0 > "$STATE"
