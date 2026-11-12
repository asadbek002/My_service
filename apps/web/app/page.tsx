import type { Metadata } from 'next';
import { IosAppLeavesHome } from '../lib/native';
import { HomePage } from '../components/landing/home-page';
import { serverOffer } from '../lib/site';

// Rendered per request (the prices are cached for 10 minutes in serverOffer), never baked at build time
// when the API is not there: a page cached at build would go out without prices in its HTML (search engines).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: "MyService — ta'mirlash ustaxonasi va servis markazi uchun dastur (CRM)" },
  description: "Telefon, noutbuk va texnika ta'miri ustaxonalari uchun onlayn dastur: qurilma qabuli va chek, ta'mir holati, mijozga SMS va Telegram xabar, to'lov, qarz, kafolat va hisobot. O'zbek va rus tilida. 1 oy bepul.",
  keywords: ["ta'mirlash ustaxonasi dasturi", 'servis markaz uchun dastur', "telefon ta'mirlash CRM", 'remont dasturi', 'ustaxona hisobi', 'MyService', 'программа для сервисного центра', 'CRM для ремонта телефонов'],
  alternates: { canonical: '/', languages: { uz: '/', ru: '/ru', 'x-default': '/' } },
  openGraph: { type: 'website', images: [{ url: '/opengraph-image', width: 1200, height: 630 }], url: '/', siteName: 'MyService', locale: 'uz_UZ', alternateLocale: ['ru_RU'],
    title: "MyService — ta'mirlash ustaxonasi uchun dastur",
    description: "Qabul va chek, ta'mir holati, mijozga SMS va Telegram, to'lov, qarz va hisobot — bitta dasturda. 1 oy bepul." },
};

export default async function Home() {
  return <><IosAppLeavesHome /><HomePage lang="uz" offer={await serverOffer()} /></>;
}
