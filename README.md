# MyService

MyService — telefon va elektron qurilmalarni ta'mirlash servislarini boshqarish uchun multi-tenant SaaS CRM.

[![CI](https://github.com/asadbek002/My_service/actions/workflows/ci.yml/badge.svg)](https://github.com/asadbek002/My_service/actions/workflows/ci.yml)

## Hozirgi holat

Repositoryda specification bo'yicha ishlaydigan MVP backend, operator web interfeysi, platform boshqaruvi, integratsiya workerlari va production Docker bazasi mavjud. Har bir push PostgreSQL, Redis va MinIO bilan schema, migration, typecheck, build hamda integratsiya testlaridan o'tadi.

## Asosiy imkoniyatlar

- Tashkilot va filiallar bo'yicha qat'iy tenant izolyatsiyasi, RBAC va audit.
- Argon2id parollar, qisqa muddatli access JWT, aylantiriladigan refresh sessionlar va reuse detection.
- Mijoz, qurilma, buyurtma, diagnostika, narx tasdig'i, ta'mirlash va final test jarayoni.
- Ombor qoldig'i, rezerv, sarflash, bekor qilishda qaytarish va parallel operatsiya himoyasi.
- To'lov, refund, xarajat, kafolat va texnik komissiyasi.
- Telegram/SMS outbox, xavfsiz tracking/tasdiqlash havolalari va tahrirlanadigan shablonlar.
- S3-compatible private fayllar, metadata tekshiruvi, PDF/QR hujjatlar.
- Dashboard, global qidiruv, hisobotlar, sozlamalar va platform admin interfeysi.
- PWA shell, Docker Compose, nginx, backup va restore yo'riqnomasi.

## Stack

- Web: Next.js, React, TypeScript, Tailwind CSS
- API: NestJS, TypeScript, REST, Swagger
- Data: PostgreSQL, Prisma, Redis, BullMQ
- Storage: S3-compatible object storage (development va CI uchun MinIO)
- Tooling: pnpm workspaces, Turborepo, Docker Compose, GitHub Actions

## Ishga tushirish

1. `.env.example` faylini `.env` sifatida nusxalang va barcha secretlarni almashtiring.
2. `corepack enable` va `pnpm install` ni bajaring.
3. `docker compose up -d postgres redis minio` bilan dependency servislarni boshlang.
4. `pnpm db:migrate`, `pnpm db:seed` va kerak bo'lsa `pnpm --filter @myservice/api seed:platform` ni bajaring.
5. `pnpm dev` bilan web va API servislarini ishga tushiring.

Production tartibi [docs/deployment.md](docs/deployment.md), bajarilgan funksiyalar [docs/progress.md](docs/progress.md), qabul mezonlari [docs/acceptance.md](docs/acceptance.md), autentifikatsiya modeli [docs/authentication.md](docs/authentication.md) da yozilgan.

## Xavfsizlik chegaralari

- `organizationId` request body yoki browserdan olinmaydi; authenticated sessiondagi user orqali aniqlanadi.
- Access token browser xotirasida, refresh credential esa `HttpOnly` cookie ichida saqlanadi.
- Bazada raw refresh token emas, faqat SHA-256 hash saqlanadi.
- Parollar Argon2id bilan hash qilinadi; source va audit logga credential yozilmaydi.
- Moliyaviy, ombor va status operatsiyalari transaction ichida bajariladi.

Production deployment hali bajarilmagan. Domain, TLS, real SMS provider, Telegram bot, secret manager va off-host backup manzili operator tomonidan berilishi kerak.
