'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { publicGet } from '../lib/api';
import { Mark } from './layout/mark';

export type Legal = { company: string; inn: string; address: string; phone: string; email: string; dataLocation: string };
const EMPTY: Legal = { company: '', inn: '', address: '', phone: '', email: '', dataLocation: '' };

/** The platform's company details (set in the platform console); an empty field shows as [ … ]. */
export function useLegal() {
  const [legal, setLegal] = useState<Legal>(EMPTY);
  useEffect(() => { publicGet<Legal>('/public/legal').then(setLegal).catch(() => undefined); }, []);
  return (k: keyof Legal, placeholder: string) => legal[k] || `[${placeholder}]`;
}

/** A readable document page: brand on top, sections, links to the other document and back. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <Link href="/login" className="mb-8 flex items-center gap-3"><Mark /><span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span></Link>
      <article className="rounded-2xl border bg-white p-5 text-[15px] leading-relaxed sm:p-8 [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-mute">Tahrir sanasi: {updated}</p>
        {children}
      </article>
      <p className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-mute">
        <Link href="/terms" className="underline">Ommaviy oferta</Link>
        <Link href="/privacy" className="underline">Maxfiylik siyosati</Link>
        <Link href="/signup" className="underline">Ro&apos;yxatdan o&apos;tish</Link>
      </p>
    </main>
  );
}
