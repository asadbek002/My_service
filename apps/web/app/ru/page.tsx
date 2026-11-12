import type { Metadata } from 'next';
import { HomePage } from '../../components/landing/home-page';
import { serverOffer } from '../../lib/site';

// Rendered per request (the prices are cached for 10 minutes in serverOffer), never baked at build time
// when the API is not there.
export const dynamic = 'force-dynamic';

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
