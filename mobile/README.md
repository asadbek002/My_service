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

## 2. App Store (Capacitor — GitHub Actions'da, Mac kerak emas)

Ilova (`mobile/ios`) saytni ochadi va unga iPhone'ning o'z imkoniyatlarini qo'shadi (Apple 4.2 qoidasi —
"faqat sayt o'rami" rad etilmasligi uchun):
- **Push-bildirishnomalar**: yangi qabul va tayyor qurilma (Telegram xabarlari bilan bir xil sozlamalar);
  bosilganda o'sha buyurtma ochiladi. Chiqishda telefon o'chiriladi.
- **Kamera**: qurilma rasmi iOS'ning kamera/galereya oynasidan.
- **Chek chop etish**: iOS printer oynasi (AirPrint), chek rasm sifatida.
- **Ulashish**: chek rasmi, PDF hisobot va mijoz havolasi iOS ulashish oynasidan.
- Internet yo'qligida o'z sahifasi; ilova ichida narx/tarif/to'lov ko'rinmaydi (3.1.1); faqat iPhone.

Kerak: **Apple Developer Program** — korxona nomidan (D-U-N-S bilan), $99/yil.

1. **App ID va ilova**: App Store Connect → Apps → «+» → New App: platforma iOS, nomi `MyService — ремонт техники`,
   asosiy til Russian, Bundle ID `uz.myserviceuz.app` (ro'yxatda bo'lmasa: developer.apple.com → Identifiers → «+» →
   App IDs → `uz.myserviceuz.app`, Capabilities: **Push Notifications**), SKU `myservice-ios`.
2. **API kalit (imzolash va yuklash uchun)**: App Store Connect → Users and Access → Integrations → App Store Connect API →
   «+», roli **Admin** → `.p8` faylni yuklab oling (bir marta beriladi). GitHub → Settings → Secrets → Actions ga:
   `APPLE_TEAM_ID` (developer.apple.com → Membership), `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (fayl matni).
3. **Push kaliti (server uchun)**: developer.apple.com → Certificates, IDs & Profiles → Keys → «+» →
   **Apple Push Notifications service (APNs)** → `.p8` ni yuklab oling. Serverdagi `.env` ga:
   ```
   APNS_KEY_ID=<kalit ID>
   APNS_TEAM_ID=<Team ID>
   APNS_KEY="<.p8 matni, qatorlar orasida \n>"
   ```
   keyin `docker compose -f docker-compose.prod.yml up -d api`. Tekshirish: ilovada kirgach iOS ruxsat so'raydi.
4. **Build**: GitHub → Actions → **«iOS (App Store)»** → Run workflow → «TestFlight» ni belgilang.
   Har safar avval simulyatorda ochib tekshiriladi, keyin imzolanib App Store Connect'ga yuklanadi (~15 daqiqada TestFlight'da).
5. **App Store Connect → ilova sahifasi**:
   - Skrinshotlar: `store/screenshots/ios-6.7` (6.9″ uchun ham qabul qilinadi). iPad kerak emas (faqat iPhone).
   - Ikonka build ichida. Privacy Policy URL: `https://myserviceuz.uz/privacy`, Support URL: `https://myserviceuz.uz/contact`.
   - **App Privacy**: Contact Info (Name, Phone Number), User Content (Photos), Identifiers (User ID),
     Usage Data (Product Interaction), Diagnostics (Crash Data) — barchasi «App Functionality»/«Analytics»,
     foydalanuvchiga bog'langan, kuzatish (tracking) **yo'q**.
   - Age rating: 4+ (barcha savollarga «None/No»). Kategoriya: Business.
   - **App Review Information**: demo login/parol (Google'ga berilgan bilan bir xil) va izoh:
     > B2B app for phone and electronics repair shops. Log in with the demo account. Native features: push
     > notifications for new and ready orders, camera for device photos at intake, AirPrint receipt printing,
     > share sheet for receipts and PDF reports. Subscriptions are sold to businesses outside the app
     > (3.1.3(c) enterprise services); the app has no purchases or prices. Account deletion: Menu → «Hisobni o'chirish».
   - Build: TestFlight'dagi buildni tanlab **Submit for Review**.

Muhim:
- Ilovada «saytda to'lang» kabi havola yoki narx **qo'shmang** (`apps/web/lib/native.ts` → `useIosApp`).
- Yangi build faqat native qism, nom yoki ikonka o'zgarganda kerak; sayt o'zgarishlari ilovada darhol ko'rinadi.
- Ikonka va splash: `store/make-icons.cjs` (bitta skript web, Play va iOS uchun).

## Do'kon matni (tayyor)

**Nomi:** MyService — ta'mir servisi
**Qisqa tavsif (80):** Telefon va texnika ta'miri ustaxonasi uchun: qabul, chek, holat, to'lov, hisobot.
**To'liq tavsif:**
> MyService — ta'mirlash ustaxonalari va servis markazlari uchun dastur. Qurilmani qabul qilib chek chiqaring,
> ta'mir holatini kuzating, mijozga Telegram yoki SMS orqali xabar yuboring, to'lov va qarzni yuriting,
> kafolatni nazorat qiling, kunlik va oylik hisobotni ko'ring. Bir nechta filial va xodim, o'zbek va rus tilida.
