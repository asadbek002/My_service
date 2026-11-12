#!/bin/sh
# Why is the site slow? Read-only health check of the server, run on lingua-server:
#   cd /opt/My_service && sh docker/perf-check.sh
# Changes nothing. Measures from the server itself (127.0.0.1), so home internet is not counted.
cd "$(dirname "$0")/.." || exit 1
line() { printf '\n== %s ==\n' "$1"; }

line "Yuklama (load average) va yadrolar"
uptime; echo "Yadro: $(nproc)"

line "Xotira va swap (swap ishlatilayotgan bo'lsa, server sekinlashadi)"
free -h
swapon --show 2>/dev/null
vmstat 1 5 | awk 'NR<=2 || NR>3'   # si/so ustunlari 0 dan katta bo'lsa — xotira yetmayapti

line "lingua.slice (barcha konteynerlar uchun umumiy 7 GB)"
systemctl show lingua.slice -p MemoryCurrent -p MemoryMax -p MemoryHigh 2>/dev/null | sed 's/=\([0-9]\{7,\}\)$/=\1 bayt/'

line "Konteynerlar: CPU va xotira"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'

line "Disk"
df -h / /opt 2>/dev/null | uniq

line "Javob vaqti (serverning o'zidan, 5 martadan)"
for url in http://127.0.0.1:3004/api/health http://127.0.0.1:3003/ http://127.0.0.1:3003/login http://127.0.0.1:3003/dashboard; do
  printf '%-40s' "$url"
  for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}s ' --max-time 20 "$url"; done; echo
done

line "So'nggi 1 soatdagi xatolar (api / web)"
for s in api web; do
  printf '%s: ' "$s"; docker compose -f docker-compose.prod.yml logs --since 1h "$s" 2>&1 | grep -ciE 'error|timeout|ECONN|out of memory'
done

line "Qayta ishga tushishlar (restart soni)"
docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}'
for c in $(docker compose -f docker-compose.prod.yml ps -q); do docker inspect -f '{{.Name}} restart={{.RestartCount}} oom={{.State.OOMKilled}}' "$c"; done
