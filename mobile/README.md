# MyService — Google Play va App Store

Ikkala ilova ham `https://myserviceuz.uz` saytini ochadi. Sayt yangilansa (git pull + docker compose),
ilova ham yangilanadi; do'konga faqat nom, ikonka yoki native qism o'zgarganda yangi versiya yuboriladi.

Tayyor narsalar (repo ichida):

| Talab | Qayerda |
|---|---|
| Ilova ichida hisobni o'chirish | Menyu → «Hisobni o'chirish» (`/delete-account`) |
| Hisobni o'chirish veb-havolasi (Google) | `https://myserviceuz.uz/delete-account` |
| Maxfiylik siyosati | `https://myserviceuz.uz/privacy` |
| Foydalanish shartlari | `https://myserviceuz.uz/terms` |
| Yordam (Support URL) | `https://myserviceuz.uz/contact` — kirmasdan ochiladi |
| Skrinshotlar | `store/screenshots/play-phone` (1080×1920), `ios-6.7` (1290×2796), `ios-6.5` (1242×2688) |
| Google Play banneri | `store/play-feature-graphic.png` (1024×500) |
| Ko'rib chiquvchi uchun demo hisob | `apps/api/scripts/demo-account.cjs` |
| Ikonkalar | `store/app-store-1024.png`, `store/play-store-512.png` |
| Digital Asset Links (Google) | `/.well-known/assetlinks.json` (.env: `ANDROID_PACKAGE`, `ANDROID_SHA256`) |
| iOS ilovada tarif/to'lov yashirilgan | `apps/web/lib/native.ts` (user agent `MyServiceApp-iOS`) |

## 0. Ikkalasidan oldin

1. Platforma panelida yuridik ma'lumotlarni to'ldiring (kompaniya, INN, manzil, email) — **«Serverlar joylashuvi»
   haqiqiy joyni yozsin** — «Janubiy Koreya». Do'kon shakllari maxfiylik siyosatiga mos bo'lishi shart.
   O'zbekiston fuqarolarining shaxsiy ma'lumotlari mamlakat ichida saqlanishi haqidagi talabni yurist bilan aniqlang.
2. Demo hisob yarating (serverda):
   ```sh
   cd /opt/My_service && docker compose -f docker-compose.prod.yml exec api node apps/api/scripts/demo-account.cjs demo
   ```
   Chiqqan login va parolni saqlang. Qayta ishga tushirsangiz, demo tozalanib qaytadan yaratiladi.

## 1. Google Play (TWA — GitHub Actions'da build)

Kerak: Google Play Developer hisobi — **Organization** (korxona nomidan, D-U-N-S bilan; ($25, bir martalik).
Korxona hisobi uchun «12 tester / 14 kun» yopiq test talabi yo'q.

1. GitHub → **Actions → «Android (Google Play)» → Run workflow** (versiya nomi ixtiyoriy). ~2 daqiqada tayyor.
   Natija «myservice-android» artefaktida: `app-release-bundle.aab` (Play Console uchun) va `app-release-signed.apk` (telefonda sinash).
2. **Birinchi marta** imzo kaliti yaratiladi — «upload-key» artefakti (3 kun turadi). Ichidagi `secrets.txt` dagi uch qiymatni
   GitHub → Settings → Secrets and variables → Actions ga qo'shing: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_PASSWORD`. Kalit va parolning nusxasini oflayn saqlang, keyin artefaktni o'chiring.
   Keyingi build'lar shu kalit bilan imzolanadi (har safar yangi kalit chiqmasligi uchun secrets shart).
3. Play Console → yangi ilova → `.aab` ni yuklang (Play App Signing yoqiladi).
4. Play Console → *Test and release → App integrity → App signing* dagi **App signing key SHA-256** ni va build sahifasidagi
   **Upload key SHA-256** ni serverdagi `.env` ga yozing:
   ```
   ANDROID_PACKAGE=uz.myserviceuz.app
   ANDROID_SHA256=<app signing SHA-256>,<upload SHA-256>
   ```
   keyin `docker compose -f docker-compose.prod.yml up -d web`. Tekshirish: `curl -s https://myserviceuz.uz/.well-known/assetlinks.json`.
   Bu bo'lmasa ilova tepasida brauzer manzil qatori ko'rinadi.
5. Yangi versiya kerak bo'lganda (nom, ikonka o'zgarsa) — 1-qadamni qayta bosing; versiya raqami o'zi oshadi.
   Saytdagi o'zgarishlar uchun build kerak emas — ilova saytni ochadi.

Play Console shakllari:
- **App access**: «All or some functionality is restricted» → demo login/parol.
- **Data safety**: to'planadi — ism, telefon (hisob va mijozlar), qurilma rasmlari (ixtiyoriy), ilova ichidagi harakatlar;
  shifrlangan holda uzatiladi (HTTPS); foydalanuvchi o'chirishni so'ray oladi (yuqoridagi havola); uchinchi tomonga sotilmaydi.
- **Account deletion**: `https://myserviceuz.uz/delete-account`.
- **Category**: Business. **Target audience**: 18+.

## 2. App Store (Capacitor, Mac kerak)

Kerak: Apple Developer Program ($99/yil), Mac va Xcode.

```sh
cd mobile/ios
npm install
npx cap add ios
npx cap sync ios
npx cap open ios      # Xcode: Signing & Capabilities → Team; App Icon ← store/app-store-1024.png
```
Muhim:
- Ilova `MyServiceApp-iOS` belgisi bilan ochiladi: tarif tanlash va to'lov matnlari unda ko'rinmaydi,
  bosh sahifa (narxlar) o'rniga kirish sahifasi ochiladi
  (Apple 3.1.1/3.1.3(b): obuna saytda boshqariladi). Ilovada «saytda to'lang» kabi havola **qo'shmang**.
- Apple 4.2 qoidasi: faqat sayt o'ramini ko'pincha rad etadi. Rad etilsa, native imkoniyat qo'shamiz
  (push-bildirishnomalar «qurilma tayyor», native kamera) — bu keyingi ish.
- App Review Information: demo login/parol, izoh: «B2B app for phone repair shops; subscriptions are sold
  to businesses outside the app (3.1.3(b)); account deletion: menu → Hisobni o'chirish».

## Do'kon matni (tayyor)

**Nomi:** MyService — ta'mir servisi
**Qisqa tavsif (80):** Telefon va texnika ta'miri ustaxonasi uchun: qabul, chek, holat, to'lov, hisobot.
**To'liq tavsif:**
> MyService — ta'mirlash ustaxonalari va servis markazlari uchun dastur. Qurilmani qabul qilib chek chiqaring,
> ta'mir holatini kuzating, mijozga Telegram yoki SMS orqali xabar yuboring, to'lov va qarzni yuriting,
> kafolatni nazorat qiling, kunlik va oylik hisobotni ko'ring. Bir nechta filial va xodim, o'zbek va rus tilida.
