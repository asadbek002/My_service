# MyService

## Production server (2026-11-08 dan)

Production — uydagi mini-PK `lingua-server` (Ubuntu 26.04). Server boshqa loyihalar bilan umumiy:
LinguaManager CRM, linguatranslation.uz, Qabuluz va do'stning izolyatsiyalangan LXD konteyneri.
Internet KT orqali, IP dinamik. Server vaqt zonasi `Asia/Tashkent`.

- **Eski Cafe24 VPS (114.202.247.36) MyService uchun ishlatilmaydi.** U yerda api/web to'xtatilgan
  (`restart=no`), nginx esa faqat `myserviceuz.uz`ni HTTPS orqali uyga yo'naltiradi.
  **MyService'ni VPS'da hech qachon ishga tushirma:** ikki joyda ishlasa, Telegram webhook va baza to'qnashadi.
- **Kirish:** Tailscale orqali `ssh asadbek@lingua-server` (uy tarmog'ida `172.30.1.2`).
  `asadbek` foydalanuvchisi `docker` guruhida, `sudo -i` kerak emas.
- **Yo'l:** `/opt/My_service` (shu repo'ning kloni). `.env` faqat serverda turadi, commit qilinmaydi.
- **Deploy:**
  ```sh
  cd /opt/My_service && git pull && docker compose -f docker-compose.prod.yml up -d --build
  ```
  Yangi migratsiya bo'lsa: `docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate`.
  Keyin tekshirish: `curl -s http://127.0.0.1:3004/api/health` va `bash ~/check-all.sh`.
- **Portlar (o‘zgartirma):** web `127.0.0.1:3003`, api `127.0.0.1:3004` (ikkalasi `network_mode: host`),
  Postgres `127.0.0.1:55432`, Redis `127.0.0.1:56379`. Qo'shni loyihalar band qilgan portlarni egallama:
  3000, 3001, 3002, 3007, 3010, 5432, 8000, 8443.
- **nginx:** `/etc/nginx/sites-available/myserviceuz` (SSL certbot orqali, avtomatik yangilanadi):
  `/api/` → 3004, `/` → 3003, `client_max_body_size 25m`.
- **DNS Eskiz'da** (`ns1/ns2.eskiz.uz`): `A @` → uy IP'si, `www` CNAME → `myserviceuz.uz`.
  `mail`, `webmail`, `ftp`, MX va SPF Eskiz pochta xostingiga (`45.138.159.4`) qaraydi, ularni o'zgartirma.
  Uy IP'si o'zgarsa, Eskiz'da `A @` yozuvi yangilanadi.
- **Telegram webhook:** `https://myserviceuz.uz/api/telegram/webhook`, `TELEGRAM_WEBHOOK_SECRET` bilan.
  `setWebhook`da `ip_address` ko'rsatma, chunki uy IP'si dinamik.
- **Backup:** `asadbek` foydalanuvchisining cron'i, har kuni 03:30 da
  `cd /opt/My_service && sh docker/backup.sh` → `./backups` + Telegram (`BACKUP_TELEGRAM_CHAT_ID`).
- **Resurslar:** serverdagi barcha Docker konteynerlari `lingua.slice` xotira chegarasini (7 GB) birga ishlatadi.
- **Docker tozalash:** faqat `docker image prune -f` va `docker builder prune -f` (osilib qolgan qatlamlar).
  `-a`, `docker system prune -a` va `docker volume prune` ishlatma, ular uchun cron ham qo'yma: Docker
  umumiy, qo'shni loyihalarning to'xtab turgan image'lari va volume'lari (ma'lumotlari) ham o'chib ketadi.
- **Mijoz IP'si:** `TRUST_PROXY_HOPS=1` uy nginx'i orqali to'g'ridan-to'g'ri kelgan so'rovlar uchun to'g'ri.
  Eski DNS bilan hali VPS orqali kelayotgan so'rovlarda ikki proksi bo'ladi. Ular VPS IP'si ostida ko'rinadi
  va login/SMS limitlarini o'zaro bo'lishadi.
