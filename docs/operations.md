# Serverni boshqarish (MyService)

## Zaxira nusxa (backup)

`docker/backup.sh` PostgreSQL dan to'liq dump oladi (`backups/<sana>/database.dump` + `SHA256SUMS`),
14 kunlik nusxalarni serverda saqlaydi va har bir nusxani server tashqarisiga yuboradi.

1. `.env` ga qo'shing:
   ```
   BACKUP_TELEGRAM_CHAT_ID=<sizning Telegram chat ID>   # @userinfobot ga /start yozsangiz ko'rsatadi
   # ixtiyoriy: KEEP_DAYS=14, BACKUP_DIR=./backups, BACKUP_RCLONE_REMOTE=b2:myservice-backups
   ```
   Avval platforma botiga (`TELEGRAM_BOT_USERNAME`) `/start` yozing — bot sizga fayl yubora olishi uchun.
2. Bir marta qo'lda sinang: `sh docker/backup.sh` — Telegramga `myservice-<sana>.dump` kelishi kerak.
3. Har kecha avtomatik:
   ```
   crontab -e
   15 3 * * * cd ~/My_service && sh docker/backup.sh >> backups/backup.log 2>&1
   ```
   Nusxa olinmasa, Telegramga «⚠️ zaxira nusxasi OLINMADI» xabari keladi.

### Tiklash (restore)

```
sh docker/restore.sh backups/<sana>/database.dump
```
Skript checksumni tekshiradi, `RESTORE` deb yozishingizni so'raydi, API ni to'xtatib bazani tiklaydi,
migratsiyalarni qo'llaydi va API ni qayta yoqadi. **Oyiga bir marta** nusxani alohida serverda tiklab
ko'ring: sinalmagan zaxira — zaxira emas.

## Loglar

Har bir konteyner logi 10 MB × 5 fayl bilan cheklangan (diskni to'ldirmaydi).
```
docker compose -f docker-compose.prod.yml logs -f --tail 200 api
```

## Monitoring

- API har 5 daqiqada o'zini tekshiradi (baza, Redis, xabarlar navbati, yuborilmagan xabarlar, platforma
  SMS balansi) va buzilganda/tiklanganda platforma adminlariga Telegramda yozadi. Holati: platforma
  paneli → Tizim → Monitoring. O'chirish: `MONITOR_ENABLED=false`; SMS balans chegarasi:
  `MONITOR_SMS_BALANCE_MIN=20000`.
- Server butunlay o'chsa, ichki monitoring xabar bera olmaydi. Shuning uchun tashqi kuzatuvni ham
  yoqing: [UptimeRobot](https://uptimerobot.com) (bepul) → HTTP(s) monitor →
  `https://myserviceuz.uz/api/health`, 5 daqiqa, ogohlantirish Telegram/email.

## Maxfiy kalitlar

`SECRETS_KEY` — ustaxonalarning bot tokenlari va Eskiz parollarini shifrlash kaliti (`openssl rand -hex 32`).
Berilmasa `JWT_ACCESS_SECRET` dan hosil qilinadi. **Bir marta qo'ygandan keyin o'zgartirmang**: aks holda
saqlangan tokenlar o'qilmaydi va ustaxonalar botini/Eskizini qayta ulashi kerak bo'ladi.
