import { SITE_URL, type Offer } from '../../lib/site';
import { SUPPORT_TELEGRAM } from '../../lib/support';

/**
 * schema.org data for search engines and AI assistants: who makes MyService, what it is, what it
 * costs (when the prices are known on the server) and the FAQ, in the page's language.
 */
export function StructuredData({ lang, offer, faq }: { lang: 'uz' | 'ru'; offer: Offer | null; faq: [string, string][] }) {
  const url = lang === 'ru' ? SITE_URL + '/ru' : SITE_URL + '/';
  const paid = (offer?.plans ?? []).map(p => Number(p.monthlyPrice)).filter(n => n > 0);
  const org = {
    '@type': 'Organization', '@id': SITE_URL + '/#org', name: 'MyService', url: SITE_URL + '/',
    logo: SITE_URL + '/icon-512.png', sameAs: [`https://t.me/${SUPPORT_TELEGRAM}`],
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', url: `https://t.me/${SUPPORT_TELEGRAM}`, availableLanguage: ['uz', 'ru'], areaServed: 'UZ' },
  };
  const app = {
    '@type': 'SoftwareApplication', '@id': SITE_URL + '/#app', name: 'MyService', url,
    applicationCategory: 'BusinessApplication', applicationSubCategory: lang === 'ru' ? 'CRM для сервисного центра' : "Ta'mirlash ustaxonasi uchun CRM",
    operatingSystem: 'Web, Android, iOS, Windows, macOS', inLanguage: ['uz', 'ru'], publisher: { '@id': SITE_URL + '/#org' },
    description: lang === 'ru'
      ? 'Программа для мастерских по ремонту телефонов, ноутбуков и техники: приём устройств и чек, статус ремонта, SMS и Telegram клиенту, оплаты, долги, гарантии и отчёты.'
      : "Telefon, noutbuk va texnika ta'miri ustaxonalari uchun dastur: qurilma qabuli va chek, ta'mir holati, mijozga SMS va Telegram xabar, to'lov, qarz, kafolat va hisobot.",
    ...(paid.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'UZS', lowPrice: Math.min(...paid), highPrice: Math.max(...paid), offerCount: paid.length, url: url + (url.endsWith('/') ? '' : '/') + '#narxlar' } } : {}),
    featureList: lang === 'ru'
      ? ['Приём устройств и чек с QR-кодом', 'SMS и Telegram клиенту, когда устройство готово', 'Учёт оплат и долгов', 'Гарантии', 'Запчасти и расходы', 'Отчёты и PDF', 'Сотрудники и филиалы']
      : ['Qurilma qabuli va QR kodli chek', 'Qurilma tayyor bo‘lganda mijozga SMS va Telegram', "To'lov va qarzlar hisobi", 'Kafolatlar', 'Zapchast va xarajatlar', 'Hisobot va PDF', 'Xodimlar va filiallar'],
  };
  const site = { '@type': 'WebSite', '@id': SITE_URL + '/#site', name: 'MyService', url: SITE_URL + '/', inLanguage: lang, publisher: { '@id': SITE_URL + '/#org' } };
  const faqPage = { '@type': 'FAQPage', inLanguage: lang, mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': [org, site, app, faqPage] }).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
