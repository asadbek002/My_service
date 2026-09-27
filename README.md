# MyService

MyService — telefon va elektron qurilmalarni ta'mirlash servislarini boshqarish uchun multi-tenant SaaS CRM.

[![CI](https://github.com/asadbek002/My_service/actions/workflows/ci.yml/badge.svg)](https://github.com/asadbek002/My_service/actions/workflows/ci.yml)

## Ish jarayoni

Bitta ustaxona uchun sodda jarayon (filial, usta biriktirish, diagnostika va ombor yo'q — zapchast bozordan olinadi):

1. **Qabul** — bitta ekranda: mijoz telefoni (qaytgan mijoz raqami bo'yicha avtomatik topiladi), qurilma (turi, brend, model), komplekt, nosozlik, **usta haqi + zapchast = jami**. Qabul chekini termoprinterda (58/80 mm) chiqarish.
2. **Holatlar** — Qabul qilindi → Ta'mirda → Tayyor → Berildi (yoki Bekor qilindi). Narx berilguncha o'zgartiriladi, har o'zgarish jurnalga yoziladi.
3. **Tayyor** bo'lganda mijozga bitta xabar ketadi: Telegram, bo'lmasa SMS.
4. **Berish** — qoldiq to'lanadi (yoki qarzga), kafolat necha kun ekani so'raladi, berish cheki chiqariladi.
5. **Hisobot** — bugungi/oylik tushum, usta haqi va zapchastga bo'lingan, xarajatlar, foyda, qarzdorlar.

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
4. `pnpm db:migrate`, `pnpm db:seed` va kerak bo'lsa `pnpm --filter @myservice/api seed:platform` ni bajaring.
5. `pnpm dev` bilan web va API servislarini ishga tushiring.

Parol esdan chiqsa (serverda): `docker compose -f docker-compose.prod.yml exec api node scripts/reset-password.cjs <login> <yangi-parol>`.

Production tartibi [docs/deployment.md](docs/deployment.md), qabul mezonlari [docs/acceptance.md](docs/acceptance.md), autentifikatsiya modeli [docs/authentication.md](docs/authentication.md) da yozilgan.

## Xavfsizlik chegaralari

- `organizationId` request body yoki browserdan olinmaydi; authenticated sessiondagi user orqali aniqlanadi.
- Access token browser xotirasida, refresh credential esa `HttpOnly` cookie ichida saqlanadi.
- Bazada raw refresh token emas, faqat SHA-256 hash saqlanadi.
- Parollar Argon2id bilan hash qilinadi; source va audit logga credential yozilmaydi.
- Moliyaviy va status operatsiyalari transaction ichida bajariladi; to'lovlar idempotent.

