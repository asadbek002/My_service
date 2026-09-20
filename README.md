# MyService

MyService — telefon va elektron qurilmalarni ta'mirlash servislarini boshqarish uchun multi-tenant SaaS CRM.

## Holat

Loyiha poydevori qurilmoqda. Master specification asosida birinchi bosqich monorepo, Docker infratuzilmasi va arxitektura chegaralarini belgilaydi.

## Texnologiyalar

- Web: Next.js, React, TypeScript, Tailwind CSS
- API: NestJS, TypeScript, REST, Swagger
- Data: PostgreSQL, Prisma, Redis, BullMQ
- Storage: S3-compatible object storage
- Tooling: pnpm workspaces, Turborepo, Docker Compose

## Ishga tushirish

1. `.env.example` faylini `.env` sifatida nusxalang.
2. Kuchli lokal secretlar va development owner parolini kiriting.
3. `corepack enable` va `pnpm install` ni bajaring.
4. `docker compose up -d postgres redis minio` bilan infratuzilmani ishga tushiring.
5. `pnpm dev` bilan web va API servislarini boshlang.

## Asosiy qoidalar

- Business ma'lumotlari `organizationId` orqali ajratiladi.
- Tenant serverdagi authenticated session orqali aniqlanadi.
- Frontend yuborgan `organizationId` ishonch manbai emas.
- Parollar faqat Argon2 hash ko'rinishida saqlanadi.
- Refresh tokenlar rotation bilan ishlaydi va bazada faqat hash saqlanadi.
- Moliyaviy va ombor operatsiyalari tranzaksiyada bajariladi.
- Kritik o'zgarishlar audit logga yoziladi.

Batafsil qarorlar: [docs/architecture.md](docs/architecture.md).
