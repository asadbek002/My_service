'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { publicGet } from '../../lib/api';
import { money } from '../../lib/format';
import { planLines, type PlanLimits } from '../../lib/plans';
import { cn } from '../../lib/utils';

type Plan = PlanLimits & { id: string; name: string; description: string | null; monthlyPrice: string; yearlyTotal: string };
type Offer = { trialDays: number; yearlyFreeMonths: number; signupOpen: boolean; trialPlanId: string | null; plans: Plan[] };

export const trialText = (days: number) => days % 30 === 0 ? `${days / 30} oy` : `${days} kun`;

/** The plans exactly as the platform priced them (Platforma → Tariflar), monthly or for a year. */
export function Pricing() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<'MONTH' | 'YEAR'>('MONTH');
  useEffect(() => { publicGet<Offer>('/public/plans').then(setOffer).catch(() => setFailed(true)); }, []);

  if (failed) return <p className="rounded-xl border bg-white p-5 text-sm text-mute">Narxlarni yuklab bo&apos;lmadi. Sahifani yangilang yoki <Link href="/signup" className="font-semibold text-ink underline">demo versiyani oching</Link> — narxlar ilova ichida ham bor.</p>;
  if (!offer) return <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Yuklanmoqda">{[0, 1, 2].map(i => <div key={i} className="h-80 animate-pulse rounded-2xl bg-black/[0.04]" />)}</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute"><b className="text-ink">{trialText(offer.trialDays)} bepul</b> — barcha imkoniyatlar bilan. Bank kartasi talab qilinmaydi.</p>
        <div className="flex rounded-full border bg-white p-0.5 text-sm" role="radiogroup" aria-label="To'lov davri">
          {(['MONTH', 'YEAR'] as const).map(p => (
            <button key={p} role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}
              className={cn('h-9 rounded-full px-3.5 font-medium transition-colors', period === p ? 'bg-ink text-white' : 'text-mute hover:text-ink')}>
              {p === 'MONTH' ? 'Oylik' : `Yillik${offer.yearlyFreeMonths ? ` · ${offer.yearlyFreeMonths} oy bepul` : ''}`}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('mt-5 grid gap-4', offer.plans.length >= 3 ? 'md:grid-cols-3' : offer.plans.length === 2 ? 'md:grid-cols-2' : 'max-w-md')}>
        {offer.plans.map(p => {
          const price = period === 'YEAR' ? p.yearlyTotal : p.monthlyPrice;
          const trial = p.id === offer.trialPlanId;
          return (
            <div key={p.id} className={cn('flex flex-col rounded-2xl border bg-white p-5', trial && 'border-ink ring-1 ring-ink')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-lg font-bold">{p.name}</p>{p.description && <p className="text-[13px] text-mute">{p.description}</p>}</div>
                {trial && <span className="shrink-0 rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-strong">Sinov tarifi</span>}
              </div>
              <p className="num mt-4 font-mono text-[1.75rem] font-semibold leading-none tracking-tight">{money(price)}<span className="font-sans text-xs font-normal text-mute"> so&apos;m / {period === 'YEAR' ? 'yil' : 'oy'}</span></p>
              <p className="mt-1 h-4 text-xs text-mute">{period === 'YEAR' ? `oyiga ${money(Math.round(Number(p.yearlyTotal) / 12))} so'm` : ''}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {planLines(p).map(t => <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-st-tayyor" />{t}</li>)}
              </ul>
              {offer.signupOpen && (
                <Link href="/signup" className={cn('mt-5 flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors', trial ? 'bg-brand text-ink hover:bg-brand-strong' : 'border hover:border-ink/40')}>Demo versiya</Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
