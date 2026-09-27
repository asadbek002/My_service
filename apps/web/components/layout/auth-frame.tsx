import type { ReactNode } from 'react';
import { Mark } from './mark';

/** Centered card for sign-in and status screens (no navigation around it). */
export function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <Mark />
          <span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span>
        </div>
        <div className="talon p-5 sm:p-6">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          <div className="mt-5">{children}</div>
        </div>
      </section>
    </main>
  );
}
