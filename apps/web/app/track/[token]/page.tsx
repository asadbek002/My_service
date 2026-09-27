'use client';

import { use, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { API_BASE } from '../../../lib/api';
import { date, money } from '../../../lib/format';
import { cn } from '../../../lib/utils';
import { Mark } from '../../../components/layout/mark';

type Tracking = { number: string; status: string; device: string; total: string; paid: string; balance: string; receivedAt: string; warrantyEnd: string | null };
const STEPS = [['RECEIVED', 'Qabul qilindi'], ['IN_REPAIR', "Ta'mirlanmoqda"], ['READY', 'Tayyor — olib ketishingiz mumkin'], ['DELIVERED', 'Berildi']] as const;

export default function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Tracking | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(API_BASE + '/public/track/' + encodeURIComponent(token), { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async r => { if (!r.ok) throw new Error('Havola topilmadi yoki muddati tugagan.'); setData(await r.json()); })
      .catch(e => setError(e instanceof Error ? e.message : 'Xato'));
  }, [token]);
  const step = data ? STEPS.findIndex(([s]) => s === data.status) : -1;

  return (
    <main className="mx-auto min-h-[100dvh] max-w-md px-4 py-8">
      <div className="mb-6 flex items-center gap-2.5"><Mark /><span className="text-sm font-bold tracking-[0.14em]">MY SERVICE</span></div>
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {!data && !error && <div className="h-64 animate-pulse rounded-lg bg-black/[0.04]" />}
      {data && (
        <article className="talon">
          <div className="p-5">
            <p className="eyebrow">Qurilma holati</p>
            <p className="mt-1 text-xl font-semibold">{data.device}</p>
            <p className="num font-mono text-sm text-mute">{data.number} · {date(data.receivedAt)}</p>
            {data.status === 'CANCELLED' ? (
              <p className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700">Buyurtma bekor qilingan. Qurilmani olib ketishingiz mumkin.</p>
            ) : (
              <ol className="mt-5 space-y-3">
                {STEPS.map(([key, label], i) => (
                  <li key={key} className="flex items-center gap-3">
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs', i <= step ? 'border-ink bg-ink text-white' : 'bg-white text-mute')}>
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={cn('text-sm', i === step ? 'font-semibold' : i < step ? '' : 'text-mute')}>{label}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="talon-cut" />
          <div className="space-y-1 p-5 text-sm">
            <p className="flex justify-between"><span className="text-mute">Narx</span><span className="num font-mono">{money(data.total)} so&apos;m</span></p>
            <p className="flex justify-between"><span className="text-mute">To&apos;langan</span><span className="num font-mono">{money(data.paid)} so&apos;m</span></p>
            {Number(data.balance) > 0 && <p className="flex justify-between font-semibold"><span>To&apos;lash kerak</span><span className="num font-mono">{money(data.balance)} so&apos;m</span></p>}
            {data.warrantyEnd && <p className="pt-2 text-emerald-700">Kafolat {date(data.warrantyEnd)} gacha</p>}
          </div>
        </article>
      )}
    </main>
  );
}
