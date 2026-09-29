# MyService

MyService — telefon va elektron qurilmalarni ta'mirlash servislarini boshqarish uchun multi-tenant SaaS CRM.

[![CI](https://github.com/asadbek002/My_service/actions/workflows/ci.yml/badge.svg)](https://github.com/asadbek002/My_service/actions/workflows/ci.yml)

## Ish jarayoni

Bitta ustaxona uchun sodda jarayon (filial, usta biriktirish, diagnostika va ombor yo'q — zapchast yon atrofdagi do'konlardan olinadi):

1. **Qabul** — bitta ekranda: mijoz telefoni (qaytgan mijoz raqami bo'yicha avtomatik topiladi), qurilma (turi, brend, model), komplekt, nosozlik, **usta haqi + zapchast = jami**. Qabul chekini termoprinterda (58/80 mm) chiqarish.
2. **Holatlar** — Qabul qilindi → Ta'mirda → Tayyor → Berildi (yoki Bekor qilindi). Narx berilguncha o'zgartiriladi, har o'zgarish jurnalga yoziladi.
3. **Tayyor** bo'lganda mijozga bitta xabar ketadi: Telegram, bo'lmasa SMS.
4. **Berish** — qoldiq to'lanadi (yoki qarzga), kafolat necha kun ekani so'raladi, berish cheki chiqariladi.
5. **Zapchastlar** — do'kondan qarzga olingan zapchast: nima, kimdan, narxi, qaysi buyurtma uchun. Keyin "Pulini berdim" (xarajatga "Zapchast xaridi" bo'lib yoziladi) yoki ishlatilmasa "Qaytardim". Do'konlar bo'yicha qarz ko'rinib turadi.
6. **Hisobot** — bugungi/oylik tushum, usta haqi va zapchastga bo'lingan, xarajatlar, foyda, mijozlar qarzi va do'konlarga qarz.

Mijoz chekida faqat umumiy narx chiqadi (usta haqi va zapchast alohida ko'rsatilmaydi); pastida Telegram va Instagram (Sozlamalarda o'zgartiriladi).

**Telegram bot** (bitta, butun platforma uchun): mijoz telefon raqamini yuborib hamma servislardagi buyurtmalari, holati va kafolatini ko'radi; "qabul qilindi / tayyor / berildi" xabarlari keladi; chek printer buzilsa, chek rasm bo'lib botga yuboriladi. Xodimlar Sozlamalardan ulanadi: yangi qabul va tayyor qurilma haqida xabar, har kuni 20:00 da kunlik hisobot, raqam yoki telefon bo'yicha qidiruv. Platforma egasi yangi servislar va obunalar haqida xabar oladi. Sozlash: [docs/notifications.md](docs/notifications.md).

Rollar: **Boshliq** va **Xodim** — xodim hamma ishni qila oladi (xodim qo'shish va sozlamalar ham), faqat boshliq akkauntini o'zgartira olmaydi. Platforma egasi servis ochadi, har qanday parolni tiklaydi va "Servisga kirish" (yordam rejimi, 2 soat, jurnalga yoziladi) orqali muammoni tuzatadi.

Interfeys telefon uchun qilingan (320 px dan boshlab), pastki menyu va asosiy tugma barmoq ostida.

## Stack

- Web: Next.js, React, TypeScript, Tailwind CSS
- API: NestJS, TypeScript, REST, Swagger
- Data: PostgreSQL, Prisma, Redis, BullMQ (fayl saqlash yo'q: cheklar brauzerda chiziladi)
- Tooling: pnpm workspaces, Turborepo, Docker Compose, GitHub Actions

## Ishga tushirish

1. `.env.example` faylini `.env` sifatida nusxalang va barcha secretlarni almashtiring.
2. `corepack enable` va `pnpm install` ni bajaring.
3. `docker compose up -d postgres redis` bilan dependency servislarni boshlang.
4. `pnpm db:migrate`, `pnpm db:seed` va kerak bo'lsa `pnpm seed:platform` (platforma egasi; parol kamida 16 belgi) ni bajaring.
5. `pnpm dev` bilan web va API servislarini ishga tushiring.

Parol esdan chiqsa (serverda): `docker compose -f docker-compose.prod.yml exec api node scripts/reset-password.cjs <login> <yangi-parol>`.

Production tartibi [docs/deployment.md](docs/deployment.md), qabul mezonlari [docs/acceptance.md](docs/acceptance.md), autentifikatsiya modeli [docs/authentication.md](docs/authentication.md) da yozilgan.

## Xavfsizlik chegaralari

- `organizationId` request body yoki browserdan olinmaydi; authenticated sessiondagi user orqali aniqlanadi.
- Access token browser xotirasida, refresh credential esa `HttpOnly` cookie ichida saqlanadi.
- Bazada raw refresh token emas, faqat SHA-256 hash saqlanadi.
- Parollar Argon2id bilan hash qilinadi; source va audit logga credential yozilmaydi.
- Moliyaviy va status operatsiyalari transaction ichida bajariladi; to'lovlar idempotent.

