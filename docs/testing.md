# Testlar (MyService)

Ikki xil test bor:

| Qayerda | Nima tekshiradi | Buyruq |
| --- | --- | --- |
| `apps/api/test` | API: xavfsizlik, servislar bir-biridan ajratilgani, bot, Eskiz | `pnpm test` |
| `apps/e2e` | Haqiqiy brauzerda butun ilova: telefon (390 px) va kompyuter ekrani | `pnpm e2e` |

Ikkalasi ham har push'da GitHub CI'da ishlaydi (`.github/workflows/ci.yml`). E2E yiqilsa,
CI sahifasidagi **e2e-report** arxivida har bir yiqilgan testning skrinshoti, videosi va
trace fayli bo'ladi (`npx playwright show-trace trace.zip` bilan qadamma-qadam ko'rinadi).

## E2E nimalarni tekshiradi

- **Sahifalar** (`pages.spec.ts`): har bir sahifa xatosiz ochiladi, xato qutisi chiqmaydi, telefonda yonga surilmaydi.
- **Buyurtma** (`order-flow.spec.ts`): qabul → ta'mir → tayyor → qisman to'lov → qarzga berish → «Qarzga berilgan» filtri → mijoz sahifasidagi filtr va PDF → qarzni to'lash; eski mijozni telefon bo'yicha topish, bekor qilish.
- **Pul** (`money.spec.ts`): ikki marta bosish bitta buyurtma va bitta to'lov yozadi; pul qaytarish; berishni tuzatish; narxni to'langandan pastga tushirish; xarajat; chek va kuzatuv sahifasi (mijoz telefoni ko'rinmaydi).
- **Hisoblar** (`accounts.spec.ts`): login, chiqish, SMS kod bilan ro'yxatdan o'tish, parolni tiklash, xodim qo'shish va birinchi kirishda parol almashtirish, to'xtatilgan xodim kira olmasligi, bir servis boshqasinikini ko'rmasligi.
- **Platforma** (`platform.spec.ts`): barcha sahifalar, murojaatga javob, servisni bloklash/ochish, e'lonlar.
- **Hisobot** (`consistency.spec.ts`): yangi servisda hisobot, to'lovlar va filtrlar aniq raqamlarga mos kelishi; ikki tab bir vaqtda sessiyani yangilashi; juda uzun ismlar; telefonni turli formatda yozish; mijozni tahrirlash.
- **Limitlar** (`limits.spec.ts`): tarif limiti tugaganda tushunarli xabar; obuna tugashiga oz qolganda va tugaganda ogohlantirish; faqat ko'rish rejimi.
- **Bir vaqtda** (`race.spec.ts`): bir vaqtda kelgan to'lovlar, qaytarishlar, qabullar va berishlar ikki marta yozilmaydi.
- **Boshqalar** (`misc.spec.ts`): tarif tanlash, sozlamalar chekda chiqishi, kafolat bo'yicha qabul, zapchast, qidiruv, CSV, 404.

## O'z kompyuteringizda ishga tushirish

PostgreSQL va Redis ishlab turishi kerak. Test **alohida** bazada ishlaydi: nomida `e2e` yoki
`test` bo'lmagan bazaga ulanishdan bosh tortadi. Hech narsani o'chirmaydi, faqat yangi ma'lumot yozadi.

```bash
createdb myservice_e2e
export DATABASE_URL=postgresql://USER:PASS@localhost:5432/myservice_e2e
pnpm install && pnpm db:generate
pnpm --filter @myservice/api build
NEXT_PUBLIC_API_URL=http://localhost:3001/api pnpm --filter @myservice/web build
pnpm --filter @myservice/e2e exec playwright install chromium   # bir marta
pnpm e2e                                   # hammasi
pnpm e2e -- --project=phone                # faqat telefon ekrani
pnpm e2e -- tests/order-flow.spec.ts --ui  # bitta fayl, brauzerni ko'rib turib
```

API (3001) va web (3000) serverlarni test o'zi ishga tushiradi; ular allaqachon ishlab tursa, o'shalardan foydalanadi.
