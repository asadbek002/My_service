# MyService'ni O'zbekistondagi serverga ko'chirish

**Nega:** foydalanuvchilar O'zbekistonda, server esa Koreyada (uyda). Toshkentdagi server bilan:
- har bir so'rov 150–300 ms o'rniga ~10–30 ms (sayt va ilova sezilarli tez);
- fuqarolarning shaxsiy ma'lumotlari O'zbekistonda saqlanadi (qonun talabi; yurist bilan tasdiqlang);
- uyda elektr / internet uzilishi yoki IP almashishi saytni to'xtatmaydi.

**Server:** Toshkentdagi VPS (UzCloud, Beeline Cloud, Ahost va h.k.), Ubuntu 24.04+, 2 vCPU, 4 GB RAM, 40+ GB SSD.
Hozirgi yuklama: api ~65 MB, web ~70 MB, Postgres ~40 MB xotira — 4 GB bemalol yetadi.

> **Qoida:** MyService bir vaqtda faqat BITTA serverda ishlasin (Telegram webhook va baza to'qnashadi).
> Ko'chish oxirida eski serverdagi api/web to'xtatiladi.

## 1. Yangi serverni tayyorlash (~20 daqiqa)

```sh
# yangi serverda, root yoki sudo bilan
apt update && apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
adduser asadbek && usermod -aG docker asadbek
su - asadbek
sudo mkdir -p /opt/My_service && sudo chown asadbek /opt/My_service
git clone https://github.com/asadbek002/my_service /opt/My_service
```

## 2. Sozlamalar va ma'lumotlarni ko'chirish (~10 daqiqa uzilish)

Eski serverda (lingua-server):
```sh
cd /opt/My_service
docker compose -f docker-compose.prod.yml stop api web            # yozuvlar to'xtaydi
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U myservice -d myservice -Fc > /tmp/move.dump
tar czf /tmp/uploads.tgz uploads
scp .env /tmp/move.dump /tmp/uploads.tgz asadbek@YANGI_SERVER_IP:/opt/My_service/
```

Yangi serverda:
```sh
cd /opt/My_service
tar xzf uploads.tgz && rm uploads.tgz
docker compose -f docker-compose.prod.yml up -d postgres redis
sleep 10
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U myservice -d myservice --clean --if-exists --no-owner < move.dump
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml run --rm api pnpm db:migrate
docker compose -f docker-compose.prod.yml up -d
curl -s http://127.0.0.1:3004/api/health        # {"status":"ok",...}
```

## 3. nginx va HTTPS

`docker/nginx.conf` dagi namunani `/etc/nginx/sites-available/myserviceuz` ga qo'ying (`/api/` → 3004, `/` → 3003,
`client_max_body_size 25m`, `http2 on`, gzip — avvalgidek), keyin:
```sh
sudo ln -s /etc/nginx/sites-available/myserviceuz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```
`.env` da `TRUST_PROXY_HOPS=1` qoladi.

## 4. DNS'ni almashtirish

Eskiz → DNS: `A @` yozuvini **yangi server IP'siga** o'zgartiring (`www` CNAME, pochta yozuvlariga tegmang).
Bir necha daqiqadan keyin:
```sh
sudo certbot --nginx -d myserviceuz.uz -d www.myserviceuz.uz
```
Telegram webhook manzili o'zgarmaydi (`https://myserviceuz.uz/api/telegram/webhook`); ishonch uchun
platforma panelida «Telegram bot → webhookni qayta o'rnatish» ni bosing.

## 5. Cron (yangi serverda, `crontab -e`)

```
30 3 * * *  cd /opt/My_service && sh docker/backup.sh >> backups/backup.log 2>&1
*/5 * * * * cd /opt/My_service && sh docker/uptime.sh >/dev/null 2>&1
30 4 1 * *  cd /opt/My_service && sh docker/restore-test.sh >> backups/restore-test.log 2>&1
```
Va boshqa bir mashinadan (eski uy serveri yoki istalgan VPS) tashqi tekshiruv — server butunlay o'chsa ham xabar keladi:
```
*/5 * * * * TELEGRAM_BOT_TOKEN=... ALERT_CHAT_ID=... CHECK_URLS="https://myserviceuz.uz/api/health https://myserviceuz.uz/login" sh /home/asadbek/uptime.sh
```

## 6. Eskisini to'xtatish

Hammasi ishlayotganiga ishonch hosil qilgach (kirish, buyurtma, chek, Telegram xabar), eski serverda:
```sh
cd /opt/My_service && docker compose -f docker-compose.prod.yml stop api web
```
Postgres va zaxiralarni bir hafta saqlab turing, keyin o'chiring. `CLAUDE.md` dagi "Production server" bo'limini
yangi server ma'lumotlari bilan yangilang.
