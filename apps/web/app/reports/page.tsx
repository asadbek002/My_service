'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, apiBlob } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { date, EXPENSE_CATEGORIES, money, phone, today } from '../../lib/format';
import { can, useMe } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ErrorBox, Loading, Row } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';

type Finance = {
  received: number; delivered: number; revenue: string; labor: string; parts: string; averageCheck: string;
  cashIn: string; refunds: string; netCash: string; expenses: { category: string; amount: string }[]; operatingExpenses: string; profit: string;
  debt: string; debtors: { id: string; number: string; createdAt: string; customer: { firstName: string; lastName?: string | null; phone: string }; device: { brand: string; model: string }; balance: string }[];
  basis: string;
};

const startOf = (day: string) => new Date(day + 'T00:00:00+05:00').toISOString();
const endOf = (day: string) => new Date(day + 'T23:59:59.999+05:00').toISOString();
function preset(key: string): [string, string] {
  const t = today();
  if (key === 'today') return [t, t];
  if (key === 'month') return [t.slice(0, 8) + '01', t];
  const d = new Date(t + 'T12:00:00+05:00');
  d.setUTCMonth(d.getUTCMonth() - 1);
  const prev = d.toISOString().slice(0, 7);
  const last = new Date(Date.UTC(Number(prev.slice(0, 4)), Number(prev.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return [prev + '-01', last];
}
const PRESETS = [['today', 'Bugun'], ['month', 'Shu oy'], ['last', "O'tgan oy"]] as const;

export default function Reports() {
  const { data: me } = useMe();
  const [range, setRange] = useState<[string, string]>(() => preset('month'));
  const [mode, setMode] = useState<string>('month');
  const finance = can(me, 'reports.finance');
  const { data, isLoading, error } = useQuery({
    queryKey: ['finance', range],
    queryFn: () => api<Finance>(`/reports/finance?from=${encodeURIComponent(startOf(range[0]))}&to=${encodeURIComponent(endOf(range[1]))}`),
    enabled: finance,
  });
  const [exportError, setExportError] = useState('');
  async function exportCsv() {
    setExportError('');
    try {
      const blob = await apiBlob(`/reports/export?from=${encodeURIComponent(startOf(range[0]))}&to=${encodeURIComponent(endOf(range[1]))}`);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `buyurtmalar-${range[0]}-${range[1]}.csv` });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { setExportError(errorText(e)); }
  }

  return (
    <AppShell title="Hisobot" narrow action={<Button variant="secondary" size="sm" onClick={exportCsv} aria-label="Excel uchun yuklab olish"><Download className="h-4 w-4" /><span className="hidden sm:inline">CSV</span></Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([key, text]) => (
            <button key={key} onClick={() => { setMode(key); setRange(preset(key)); }} aria-pressed={mode === key}
              className={cn('h-9 rounded-full border px-3.5 text-sm', mode === key ? 'border-ink bg-ink text-white' : 'bg-white')}>{text}</button>
          ))}
          <button onClick={() => setMode('custom')} aria-pressed={mode === 'custom'} className={cn('h-9 rounded-full border px-3.5 text-sm', mode === 'custom' ? 'border-ink bg-ink text-white' : 'bg-white')}>Sana</button>
        </div>
        {mode === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={range[0]} max={range[1]} onChange={e => e.target.value && setRange([e.target.value, range[1]])} aria-label="Boshlanish" />
            <Input type="date" value={range[1]} min={range[0]} max={today()} onChange={e => e.target.value && setRange([range[0], e.target.value])} aria-label="Tugash" />
          </div>
        )}
        <ErrorBox>{exportError}</ErrorBox>
        {!finance ? <p className="text-sm text-mute">Moliyaviy hisobotni ko&apos;rish uchun ruxsat yo&apos;q.</p> : error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
          <>
            <section className="talon">
              <div className="p-4">
                <p className="eyebrow">Tushum · {date(startOf(range[0]))} – {date(endOf(range[1]))}</p>
                <p className="num mt-1 font-mono text-3xl font-semibold">{money(data.revenue)}</p>
                <p className="text-sm text-mute">{data.delivered} ta qurilma berildi · {data.received} ta qabul · o&apos;rtacha chek {money(data.averageCheck)}</p>
              </div>
              <div className="talon-cut" />
              <div className="p-4">
                <Row label="Usta haqi">{money(data.labor)}</Row>
                <Row label="Zapchast">{money(data.parts)}</Row>
                <Row label="Xarajatlar">−{money(data.operatingExpenses)}</Row>
                <div className="mt-1 border-t pt-1"><Row label="Foyda" strong>{money(data.profit)}</Row></div>
              </div>
            </section>
            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 font-semibold">Kassa</h2>
              <Row label="Tushgan pul">{money(data.cashIn)}</Row>
              <Row label="Qaytarilgan">−{money(data.refunds)}</Row>
              <Row label="Sof" strong>{money(data.netCash)}</Row>
            </section>
            {data.expenses.length > 0 && (
              <section className="rounded-lg border bg-white p-4">
                <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold">Xarajatlar</h2><Link href="/expenses" className="text-sm text-mute hover:text-ink">Yozish</Link></div>
                {data.expenses.map(e => <Row key={e.category} label={EXPENSE_CATEGORIES[e.category] ?? e.category}>{money(e.amount)}</Row>)}
              </section>
            )}
            <section id="debtors">
              <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold">Qarzdorlar</h2><span className="num font-mono text-sm font-semibold text-amber-700">{money(data.debt)}</span></div>
              {data.debtors.length === 0 ? <p className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-mute">Qarz yo&apos;q</p> : (
                <List>
                  {data.debtors.map(d => (
                    <ListRow key={d.id} href={`/orders/${d.id}`} title={`${d.customer.firstName} · ${d.device.brand} ${d.device.model}`}
                      sub={<span className="num font-mono">{d.number} · {phone(d.customer.phone)}</span>} right={<span className="text-amber-700">{money(d.balance)}</span>} />
                  ))}
                </List>
              )}
            </section>
            <p className="text-xs text-mute">{data.basis}</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
