'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { money } from '../../lib/format';
import { can, invalidateBusiness, useMe, useOrders } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { MoneyInput } from '../../components/ui/money-input';
import { Empty, ErrorBox, Loading, Notice } from '../../components/ui/feedback';
import { PartRow, type SourcedPart } from '../../components/part-row';

type Parts = { items: SourcedPart[]; debt: string; byShop: { shop: string; count: number; amount: string }[]; shops: string[] };

const FILTERS = [['TAKEN', "To'lanmagan"], ['PAID', "To'langan"], ['RETURNED', 'Qaytarilgan'], ['', 'Hammasi']] as const;

export default function Page() {
  return <Suspense><PartsPage /></Suspense>;
}

function PartsPage() {
  const params = useSearchParams();
  const orderId = params.get('order') ?? '';
  const { data: me } = useMe();
  const [filter, setFilter] = useState<string>('TAKEN');
  const { data, isLoading, error } = useQuery({ queryKey: ['parts', filter], queryFn: () => api<Parts>('/parts' + (filter ? '?status=' + filter : '')) });
  const edit = can(me, 'orders.edit');
  return (
    <AppShell title="Zapchastlar" narrow {...(orderId ? { back: `/orders/${orderId}` } : {})}>
      <div className="space-y-4">
        <p className="text-sm text-mute">Do&apos;kondan olib kelingan zapchast: keyin pulini berasiz yoki ishlatilmasa qaytarasiz.</p>
        {edit && <PartForm shops={data?.shops ?? []} orderId={orderId} />}

        {data && Number(data.debt) > 0 && (
          <section className="talon">
            <div className="flex items-baseline justify-between p-4">
              <span className="font-semibold">Do&apos;konlarga qarz</span>
              <span className="num font-mono text-lg font-semibold text-amber-700">{money(data.debt)}</span>
            </div>
            <div className="talon-cut" />
            <ul className="divide-y px-4 py-1">
              {data.byShop.map(s => (
                <li key={s.shop} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{s.shop} <span className="text-mute">· {s.count} ta</span></span>
                  <span className="num font-mono">{money(s.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map(([key, text]) => (
            <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
              className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm', filter === key ? 'border-ink bg-ink text-white' : 'bg-white')}>{text}</button>
          ))}
        </div>
        {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={4} /> : !data?.items.length ? <Empty title="Bu yerda zapchast yo'q" /> : (
          <ul className="space-y-2">{data.items.map(p => <PartRow key={p.id} part={p} canEdit={edit} />)}</ul>
        )}
      </div>
    </AppShell>
  );
}

function PartForm({ shops, orderId }: { shops: string[]; orderId: string }) {
  const qc = useQueryClient();
  const { data: open } = useOrders('open');
  const [name, setName] = useState('');
  const [shop, setShop] = useState('');
  const [cost, setCost] = useState('');
  const [order, setOrder] = useState(orderId);
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && shop.trim() && Number(cost);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (state.ok || state.error) setState({}); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setState({});
    try {
      await api('/parts', { method: 'POST', body: JSON.stringify({ name: name.trim(), shop: shop.trim(), cost, ...(order ? { orderId: order } : {}) }) });
      setName(''); setCost('');
      setState({ ok: `Yozildi: ${name.trim()} — ${shop.trim()}` });
      document.getElementById('part-name')?.focus();
      await invalidateBusiness(qc);
    } catch (err) { setState({ error: errorText(err) }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="rounded-lg border bg-white p-4" noValidate>
      <h2 className="mb-3 font-semibold">Zapchast olish</h2>
      <div className="grid gap-3">
        <label className="grid gap-1.5"><span className="text-sm font-medium">Nima</span><Input id="part-name" value={name} onChange={e => edit(setName)(e.target.value)} placeholder="Masalan: iPhone 13 ekran" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Kimdan (do&apos;kon)</span>
            <Input value={shop} onChange={e => edit(setShop)(e.target.value)} list="shops" placeholder="Malika, 12-do'kon" autoComplete="off" />
            <datalist id="shops">{shops.map(s => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="grid gap-1.5"><span className="text-sm font-medium">Narxi</span><MoneyInput value={cost} onChange={edit(setCost)} /></label>
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Qaysi buyurtma uchun</span>
          <Select value={order} onChange={e => edit(setOrder)(e.target.value)}>
            <option value="">— Buyurtmasiz —</option>
            {open?.map(o => <option key={o.id} value={o.id}>{o.number} · {o.device.brand} {o.device.model} · {o.customer.firstName}</option>)}
          </Select>
        </label>
        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
        <Button type="submit" className="w-full sm:w-fit" disabled={busy || !ready}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>
      </div>
    </form>
  );
}
