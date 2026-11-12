import type { Metadata } from 'next';
import { HomePage } from '../../components/landing/home-page';
import { serverOffer } from '../../lib/site';

// The same page for everyone: built once, then rebuilt in the background at most every 5 minutes, so a crowd
// of visitors costs nothing (rendering it per request took ~15 ms of CPU each). Prices come from serverOffer;
// when the API is not reachable (build time) the browser loads them, as before.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: 'MyService — программа для сервисного центра и ремонтной мастерской (CRM)' },
  description: 'Онлайн-программа для мастерских по ремонту телефонов, ноутбуков и техники в Узбекистане: приём устройств и чек, статус ремонта, SMS и Telegram клиенту, оплаты, долги, гарантии и отчёты. 1 месяц бесплатно.',
  keywords: ['программа для сервисного центра', 'CRM для ремонта телефонов', 'учёт ремонта', 'программа для мастерской', 'сервисный центр Ташкент', 'MyService'],
  alternates: { canonical: '/ru', languages: { uz: '/', ru: '/ru', 'x-default': '/' } },
  openGraph: { type: 'website', images: [{ url: '/opengraph-image', width: 1200, height: 630 }], url: '/ru', siteName: 'MyService', locale: 'ru_RU', alternateLocale: ['uz_UZ'],
    title: 'MyService — программа для ремонтной мастерской',
    description: 'Приём и чек, статус ремонта, SMS и Telegram клиенту, оплаты, долги и отчёты — в одной программе. 1 месяц бесплатно.' },
};

export default async function HomeRu() {
  return <HomePage lang="ru" offer={await serverOffer()} />;
}
