import type { Metadata } from 'next';
import { HomePage } from '../components/landing/home-page';
import { serverOffer } from '../lib/site';

// The same page for everyone: built once, then rebuilt in the background at most every 5 minutes, so a crowd
// of visitors costs nothing (rendering it per request took ~15 ms of CPU each). Prices come from serverOffer;
// when the API is not reachable (build time) the browser loads them, as before.
export const revalidate = 300;

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
  return <HomePage lang="uz" offer={await serverOffer()} />;
}
