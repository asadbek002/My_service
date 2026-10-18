import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { NoZoom, ServiceWorkerRegister } from './sw-register';
import { QueryProvider } from '../components/query-provider';
import './styles.css';


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
    <html lang="uz">
      <head>
        {/* Fonts live in public/fonts (see styles.css); the Latin files are needed on the first paint. */}
        <link rel="preload" href="/fonts/geologica-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/martian-mono-latin.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <ServiceWorkerRegister />
        <NoZoom />
      </body>
    </html>
  );
}
