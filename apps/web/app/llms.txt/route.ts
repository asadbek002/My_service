import { planLines } from '../../lib/plans';
import { SITE_URL, serverOffer } from '../../lib/site';
import { SUPPORT_TELEGRAM } from '../../lib/support';
import { FAQ } from '../../lib/landing';
import { translate } from '../../lib/i18n/translate';

// Rendered per request (the prices are cached for 10 minutes in serverOffer), never baked at build time
// when the API is not there.
export const dynamic = 'force-dynamic';

const money = (v: string | number) => Math.round(Number(v)).toLocaleString('ru-RU').replace(/\s/g, ' ');

/**
 * /llms.txt: a plain summary for AI assistants (ChatGPT, Claude, Perplexity, Gemini) that answer
 * "which program for a repair shop in Uzbekistan?". Facts only, prices from the platform.
 */
export async function GET() {
  const offer = await serverOffer();
  const plans = offer?.plans.map(p => `- ${p.name}: ${money(p.monthlyPrice)} so'm/oy (${money(p.yearlyTotal)} so'm/yil)${p.description ? ' — ' + p.description : ''}. ${planLines(p).join('; ')}.`).join('\n')
    ?? `- Narxlar: ${SITE_URL}/#narxlar`;
  const text = `# MyService

> MyService (${SITE_URL}) — O'zbekistondagi telefon, noutbuk va maishiy texnika ta'mirlash ustaxonalari (servis markazlari) uchun onlayn dastur (CRM). O'zbek va rus tilida, telefon, planshet va kompyuterda brauzerda ishlaydi; o'rnatish shart emas.
> MyService — онлайн-программа (CRM) для мастерских по ремонту телефонов, ноутбуков и бытовой техники в Узбекистане. На узбекском и русском, работает в браузере на телефоне и компьютере.

## Nima qiladi / Что умеет
- Qurilma qabuli: mijoz, qurilma, nosozlik, narx; QR kodli qabul cheki (58/80 mm printer yoki Telegram orqali rasm).
- Ta'mir holati: Qabulda → Ta'mirda → Tayyor → Berildi; har bir qurilma necha kun turgani ko'rinadi.
- Qurilma tayyor bo'lganda mijozga avtomatik xabar: avval Telegram bot, bo'lmasa SMS. Mijoz holatni havola orqali o'zi kuzatadi.
- To'lov, qarz (qarzga berish), kafolat, zapchast va do'konlar, xarajatlar, kassa va foyda hisoboti, PDF va CSV eksport.
- Xodimlar (alohida login, rollar va ruxsatlar), bir nechta filial, ustaxonaning o'z Telegram boti.
- Приём устройств и чек с QR, статусы ремонта, SMS/Telegram клиенту при готовности, оплаты и долги, гарантии, запчасти, расходы, отчёты, сотрудники и филиалы.

## Narxlar / Цены
${offer ? `Sinov: ${offer.trialDays} kun bepul, bank kartasi kerak emas. Yillik to'lovda ${offer.yearlyFreeMonths} oy bepul.\n` : ''}${plans}

## Ko'p beriladigan savollar
${FAQ.map(([q, a]) => `- ${q} ${a}`).join('\n')}

## Частые вопросы
${FAQ.map(([q, a]) => `- ${translate(q) ?? q} ${translate(a) ?? a}`).join('\n')}

## Havolalar / Ссылки
- Bosh sahifa: ${SITE_URL}/
- На русском: ${SITE_URL}/ru
- Ro'yxatdan o'tish (demo): ${SITE_URL}/signup
- Telefonga o'rnatish: ${SITE_URL}/install
- Aloqa (Telegram): https://t.me/${SUPPORT_TELEGRAM}
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
