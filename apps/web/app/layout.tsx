import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from './sw-register';
import { QueryProvider } from '../components/query-provider';
import './styles.css';

export const metadata: Metadata = {
  title: 'MyService',
  description: 'Premium Repair Service',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'MyService', statusBarStyle: 'default' },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="uz">
      <body>
        <QueryProvider>
          {children}
        </QueryProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
