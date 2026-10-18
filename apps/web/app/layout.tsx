import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geologica, Martian_Mono } from 'next/font/google';
import { NoZoom, ServiceWorkerRegister } from './sw-register';
import { QueryProvider } from '../components/query-provider';
import './styles.css';

// Self-hosted at build time by next/font: same letters on every phone, Latin and Cyrillic.
const sans = Geologica({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });
const mono = Martian_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono', display: 'swap', weight: ['400', '600'] });

export const metadata: Metadata = {
  title: 'MyService',
  description: "Ta'mirlash servisi uchun buyurtmalar, to'lovlar va hisobot",
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'MyService', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

// viewport-fit=cover lets the tab bar sit above the iPhone home indicator (safe-area insets).
// No pinch-zoom: the app behaves like an installed app (Android honours this; iOS needs NoZoom below).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#EEF2F1' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="uz" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegister />
        <NoZoom />
      </body>
    </html>
  );
}
