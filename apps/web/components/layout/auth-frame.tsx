import type { ReactNode } from 'react';
import { Mark } from './mark';
import { Ruler } from '../ui/ruler';

/**
 * Sign-in and status screens: the workshop mat on one side (top band on phones), the form on paper.
 * No navigation around it.
 */
export function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="min-h-[100dvh] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="mat on-ink relative flex flex-col justify-between overflow-hidden px-6 pb-16 pt-[calc(2rem+env(safe-area-inset-top))] text-white lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <Mark size="lg" />
          <div>
            <p className="text-sm font-bold tracking-[0.14em]">MY SERVICE</p>
            <p className="text-xs text-white/60">Ta&apos;mir servisi uchun</p>
          </div>
        </div>
        <div className="mt-10 lg:mt-0">
          <p className="max-w-md text-2xl font-bold leading-tight tracking-tight lg:text-[2.6rem]">Qabul, ta&apos;mir, to&apos;lov va qarz — bitta peshtaxtada.</p>
          <div className="mt-6 hidden items-end gap-6 lg:flex" aria-hidden="true">
            {([[2, 'tamir', "Ta'mirda"], [4, 'tayyor', 'Tayyor'], [8, 'tayyor', 'Kutmoqda']] as const).map(([days, kind, label]) => (
              <div key={label} className="space-y-2"><Ruler days={days} kind={kind} /><p className="font-mono text-[10px] uppercase tracking-[0.08em] text-white/50">{label} · {days} kun</p></div>
            ))}
          </div>
        </div>
        <p className="mt-6 hidden text-xs text-white/40 lg:block">Har bir qurilma necha kundan beri ustaxonada turgani — lineykada.</p>
      </aside>
      <div className="flex justify-center px-4 lg:items-center lg:px-10 lg:py-12">
        <section className="relative z-10 -mt-10 w-full max-w-sm pb-10 lg:mt-0 lg:pb-0">
          <div className="rounded-2xl border bg-white p-5 shadow-[0_12px_32px_-18px_rgba(12,22,21,0.35)] sm:p-7 lg:shadow-none">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
            <div className="mt-5">{children}</div>
          </div>
          <p className="mt-4 flex justify-center gap-4 text-xs text-mute"><a href="/terms" className="hover:text-ink hover:underline">Ommaviy oferta</a><a href="/privacy" className="hover:text-ink hover:underline">Maxfiylik siyosati</a></p>
        </section>
      </div>
    </main>
  );
}
