import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from './sw-register';
import './styles.css';
export const metadata: Metadata = { title: 'MyService', description: 'Premium Repair Service', manifest: '/manifest.webmanifest' };
export default function RootLayout({children}:Readonly<{children:ReactNode}>){return <html lang="uz"><body>{children}<ServiceWorkerRegister/></body></html>}