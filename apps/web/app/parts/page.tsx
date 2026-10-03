'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Phone, Plus, Store } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, money, normalizePhone, phone as fmtPhone } from '../../lib/format';
import { can, invalidateBusiness, useMe, useOrders } from '../../lib/queries';
import { periodLabel, periodQuery, preset, type Period, type PeriodKey } from '../../lib/period';
import { downloadPdf } from '../../lib/pdf';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { MoneyInput } from '../../components/ui/money-input';
import { Empty, ErrorBox, Loading, Notice, Row } from '../../components/ui/feedback';
import { PeriodPicker } from '../../components/period-picker';
import { PART_STATUS, PartRow, type SourcedPart } from '../../components/part-row';

type ShopRef = { id: string; name: string };
type Shop = ShopRef & { phone?: string | null; address?: string | null; note?: string | null; archived: boolean; debt: string; debtCount: number; paid: string };
type Parts = {
  items: SourcedPart[]; shops: ShopRef[]; debt: string;
  totals: { count: number; taken: string; paid: string; returned: string; all: string };
  byShop: { shopId: string | null; shop: string; count: number; amount: string }[];
};

const STATUSES = [['', 'Hammasi'], ['TAKEN', "To'lanmagan"], ['PAID', "To'langan"], ['RETURNED', 'Qaytarilgan']] as const;

export default function Page() {
  return <Suspense><PartsPage /></Suspense>;
}

function PartsPage() {
  const params = useSearchParams();
  const orderId = params.get('order') ?? '';
  const [tab, setTab] = useState<'parts' | 'shops'>(params.get('tab') === 'shops' ? 'shops' : 'parts');
  return (
    <AppShell title="Zapchastlar" narrow {...(orderId ? { back: `/orders/${orderId}` } : {})}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/[0.05] p-1" role="tablist">
          {([['parts', 'Zapchastlar'], ['shops', "Do'konlar"]] as const).map(([key, text]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`h-10 rounded-md text-sm font-semibold ${tab === key ? 'bg-white shadow-sm' : 'text-mute'}`}>{text}</button>
          ))}
        </div>
        {tab === 'parts' ? <PartsTab orderId={orderId} openShops={() => setTab('shops')} /> : <ShopsTab />}
      </div>
    </AppShell>
  );
}

// ---------------- Parts ----------------

function PartsTab({ orderId, openShops }: { orderId: string; openShops: () => void }) {
  const { data: me } = useMe();
  const edit = can(me, 'orders.edit');
  const [status, setStatus] = useState<string>('TAKEN');
  const [shopId, setShopId] = useState('');
  const [mode, setMode] = useState<PeriodKey>('all');
  const [range, setRange] = useState<Period>(preset('all'));
  const query = [status && 'status=' + status, shopId && 'shopId=' + shopId, periodQuery(range)].filter(Boolean).join('&');
  const { data, isLoading, error } = useQuery({ queryKey: ['parts', query], queryFn: () => api<Parts>('/parts' + (query ? '?' + query : '')) });
  const [pdfState, setPdfState] = useState('');

  async function pdf() {
    if (!data) return;
    setPdfState('');
    try {
      const shopName = data.shops.find(s => s.id === shopId)?.name;
      // Per shop: what was taken in this selection and how it was settled.
      const groups = new Map<string, { count: number; taken: number; paid: number; returned: number }>();
      for (const p of data.items) {
        const g = groups.get(p.shop) ?? { count: 0, taken: 0, paid: 0, returned: 0 };
        g.count++; g[p.status === 'TAKEN' ? 'taken' : p.status === 'PAID' ? 'paid' : 'returned'] += Number(p.cost);
        groups.set(p.shop, g);
      }
      await downloadPdf({
        fileName: `zapchastlar-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'Zapchastlar hisoboti',
        subtitle: [periodLabel(range), shopName ? "Do'kon: " + shopName : "Barcha do'konlar", status ? 'Holat: ' + PART_STATUS[status]![0] : 'Barcha holatlar'].join(' · '),
        sections: [
          { title: 'Umumiy', summary: [
            ['Zapchastlar soni', String(data.totals.count)],
            ["To'lanmagan (qarz)", money(data.totals.taken) + " so'm"],
            ["To'langan", money(data.totals.paid) + " so'm"],
            ['Qaytarilgan', money(data.totals.returned) + " so'm"],
            ["Do'konlarga hozirgi jami qarz", money(data.debt) + " so'm"],
          ] },
          { title: "Do'konlar bo'yicha", table: {
            head: ["Do'kon", 'Soni', "To'lanmagan", "To'langan", 'Qaytarilgan'], right: [1, 2, 3, 4],
            rows: [...groups].map(([name, g]) => [name, String(g.count), money(g.taken), money(g.paid), money(g.returned)]),
          } },
          { title: "Zapchastlar ro'yxati", table: {
            head: ['Sana', 'Zapchast', "Do'kon", 'Buyurtma', 'Holat', 'Narxi'], right: [5],
            rows: data.items.map(p => [dateTime(p.createdAt), p.name, p.shop, p.order?.number ?? '—', PART_STATUS[p.status]?.[0] ?? p.status, money(p.cost)]),
            foot: ['', '', '', '', 'Jami', money(data.totals.all)],
          }, note: "Jami — qaytarilganlarsiz. To'langan zapchastlar Xarajatlarda «Zapchast xaridi» bo'lib ham ko'rinadi." },
        ],
      });
    } catch (e) { setPdfState(errorText(e)); }
  }

  return (
    <div className="space-y-4">
      {edit && <PartForm shops={data?.shops ?? []} orderId={orderId} openShops={openShops} />}

      {data && Number(data.debt) > 0 && (
        <section className="talon">
          <div className="flex items-baseline justify-between p-4">
            <span className="font-semibold">Do&apos;konlarga qarz</span>
            <span className="num font-mono text-lg font-semibold text-amber-700">{money(data.debt)}</span>
          </div>
          <div className="talon-cut" />
          <ul className="divide-y px-4 py-1">
            {data.byShop.map(s => (
              <li key={s.shopId ?? s.shop}>
                <button className="flex w-full items-baseline justify-between gap-3 py-2 text-left text-sm" onClick={() => { setShopId(s.shopId ?? ''); setStatus('TAKEN'); }}>
                  <span className="min-w-0 truncate">{s.shop} <span className="text-mute">· {s.count} ta</span></span>
                  <span className="num font-mono">{money(s.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Saralash</h2>
          <Button variant="secondary" size="sm" onClick={pdf} disabled={!data}><FileDown className="h-4 w-4" /> PDF</Button>
        </div>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {STATUSES.map(([key, text]) => <button key={key} className="chip" aria-pressed={status === key} onClick={() => setStatus(key)}>{text}</button>)}
        </div>
        <Select value={shopId} onChange={e => setShopId(e.target.value)} aria-label="Do'kon">
          <option value="">Barcha do&apos;konlar</option>
          {data?.shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <PeriodPicker mode={mode} value={range} onChange={(m, v) => { setMode(m); setRange(v); }} />
        {data && (
          <div className="rounded-md bg-paper px-3 py-2">
            <Row label={`${data.totals.count} ta zapchast`}>{money(data.totals.all)}</Row>
            {Number(data.totals.taken) > 0 && <Row label="To'lanmagan"><span className="text-amber-700">{money(data.totals.taken)}</span></Row>}
            {Number(data.totals.paid) > 0 && <Row label="To'langan">{money(data.totals.paid)}</Row>}
            {Number(data.totals.returned) > 0 && <Row label="Qaytarilgan">{money(data.totals.returned)}</Row>}
          </div>
        )}
        <ErrorBox>{pdfState}</ErrorBox>
      </section>

      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={4} /> : !data?.items.length ? <Empty title="Tanlangan bo'yicha zapchast yo'q" /> : (
        <ul className="space-y-2">{data.items.map(p => <PartRow key={p.id} part={p} canEdit={edit} canFix={edit && me?.role === 'OWNER'} />)}</ul>
      )}
    </div>
  );
}

function PartForm({ shops, orderId, openShops }: { shops: ShopRef[]; orderId: string; openShops: () => void }) {
  const qc = useQueryClient();
  const { data: open } = useOrders('open');
  const [name, setName] = useState('');
  const [shopId, setShopId] = useState('');
  const [cost, setCost] = useState('');
  const [order, setOrder] = useState(orderId);
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  const ready = name.trim() && shopId && Number(cost);
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (state.ok || state.error) setState({}); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setState({});
    try {
      await api('/parts', { method: 'POST', body: JSON.stringify({ name: name.trim(), shopId, cost, ...(order ? { orderId: order } : {}) }) });
      setName(''); setCost('');
      setState({ ok: `Yozildi: ${name.trim()} — ${shops.find(s => s.id === shopId)?.name ?? ''}` });
      document.getElementById('part-name')?.focus();
      await invalidateBusiness(qc);
    } catch (err) { setState({ error: errorText(err) }); } finally { setBusy(false); }
  }
  if (!shops.length) {
    return (
      <section className="rounded-lg border border-dashed bg-white p-4 text-center">
        <Store className="mx-auto h-6 w-6 text-mute" />
        <p className="mt-2 font-medium">Avval do&apos;konlarni qo&apos;shing</p>
        <p className="mt-0.5 text-sm text-mute">Zapchast oladigan do&apos;konlaringizni bir marta saqlang — keyin ro&apos;yxatdan tanlaysiz.</p>
        <Button className="mt-3" onClick={openShops}><Plus className="h-4 w-4" /> Do&apos;kon qo&apos;shish</Button>
      </section>
    );
  }
  return (
    <form onSubmit={save} className="rounded-lg border bg-white p-4" noValidate>
      <h2 className="mb-3 font-semibold">Zapchast olish</h2>
      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="flex items-baseline justify-between text-sm font-medium">Kimdan (do&apos;kon)
            <button type="button" onClick={openShops} className="text-xs font-normal text-mute underline">Yangi do&apos;kon</button>
          </span>
          <Select value={shopId} onChange={e => edit(setShopId)(e.target.value)}>
            <option value="">— Do&apos;konni tanlang —</option>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </label>
        <label className="grid gap-1.5"><span className="text-sm font-medium">Nima</span><Input id="part-name" value={name} onChange={e => edit(setName)(e.target.value)} placeholder="Masalan: iPhone 13 ekran" /></label>
        <label className="grid gap-1.5"><span className="text-sm font-medium">Narxi</span><MoneyInput value={cost} onChange={edit(setCost)} /></label>
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

// ---------------- Shops ----------------

function ShopsTab() {
  const { data: me } = useMe();
  const edit = can(me, 'orders.edit');
  const { data, isLoading, error } = useQuery({ queryKey: ['parts', 'shops'], queryFn: () => api<Shop[]>('/shops') });
  const active = data?.filter(s => !s.archived) ?? [], archived = data?.filter(s => s.archived) ?? [];
  return (
    <div className="space-y-4">
      {edit && <ShopForm />}
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={3} /> : !active.length ? <Empty title="Hali do'kon yo'q">Zapchast oladigan do&apos;konlarni yuqorida qo&apos;shing.</Empty> : (
        <ul className="space-y-2">{active.map(s => <ShopCard key={s.id} shop={s} canEdit={edit} />)}</ul>
      )}
      {archived.length > 0 && (
        <details className="rounded-lg border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Arxivdagi do&apos;konlar ({archived.length})</summary>
          <ul className="mt-3 space-y-2">{archived.map(s => <ShopCard key={s.id} shop={s} canEdit={edit} />)}</ul>
        </details>
      )}
    </div>
  );
}

function ShopForm({ shop, onDone }: { shop?: Shop; onDone?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(shop?.name ?? '');
  const [phone, setPhone] = useState(shop?.phone ? fmtPhone(shop.phone) : '');
  const [address, setAddress] = useState(shop?.address ?? '');
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setState({});
    try {
      const body = JSON.stringify({ name: name.trim(), phone: phone.trim() ? normalizePhone(phone) : '', address: address.trim() });
      await api(shop ? '/shops/' + shop.id : '/shops', { method: shop ? 'PATCH' : 'POST', body });
      await invalidateBusiness(qc);
      if (shop) { onDone?.(); return; }
      setName(''); setPhone(''); setAddress('');
      setState({ ok: `Saqlandi: ${name.trim()}` });
    } catch (err) {
      setState({ error: err instanceof Error && err.message === 'Shop exists' ? "Bu nomli do'kon allaqachon bor." : errorText(err) });
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className={shop ? 'mt-3 grid gap-3' : 'grid gap-3 rounded-lg border bg-white p-4'} noValidate>
      {!shop && <h2 className="font-semibold">Do&apos;kon qo&apos;shish</h2>}
      <label className="grid gap-1.5"><span className="text-sm font-medium">Nomi</span><Input value={name} onChange={e => setName(e.target.value)} placeholder="Masalan: Malika, 12-do'kon" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5"><span className="text-sm font-medium">Telefon</span><Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" /></label>
        <label className="grid gap-1.5"><span className="text-sm font-medium">Manzil</span><Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Ixtiyoriy" /></label>
      </div>
      <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
      <div className="flex gap-2">
        {shop && <Button type="button" variant="secondary" onClick={onDone}>Bekor</Button>}
        <Button type="submit" className="w-full sm:w-fit" disabled={busy || !name.trim()}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>
      </div>
    </form>
  );
}

function ShopCard({ shop, canEdit }: { shop: Shop; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  async function archive(archived: boolean) {
    setError('');
    try { await api('/shops/' + shop.id, { method: 'PATCH', body: JSON.stringify({ name: shop.name, phone: shop.phone ?? '', address: shop.address ?? '', archived }) }); await invalidateBusiness(qc); }
    catch (e) { setError(errorText(e)); }
  }
  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{shop.name}</p>
          {shop.phone && <a href={`tel:${shop.phone}`} className="num inline-flex items-center gap-1.5 font-mono text-sm text-mute"><Phone className="h-3.5 w-3.5" />{fmtPhone(shop.phone)}</a>}
          {shop.address && <p className="truncate text-sm text-mute">{shop.address}</p>}
        </div>
        <div className="shrink-0 text-right text-sm">
          {Number(shop.debt) > 0 ? <p className="num font-mono font-semibold text-amber-700">{money(shop.debt)}</p> : <p className="text-emerald-700">Qarz yo&apos;q</p>}
          {Number(shop.debt) > 0 && <p className="text-xs text-mute">{shop.debtCount} ta to&apos;lanmagan</p>}
          <p className="text-xs text-mute">To&apos;langan: {money(shop.paid)}</p>
        </div>
      </div>
      {canEdit && !editing && (
        <div className="mt-3 flex gap-3 text-sm">
          <button className="font-medium underline" onClick={() => setEditing(true)}>Tahrirlash</button>
          <button className="text-mute underline" onClick={() => archive(!shop.archived)}>{shop.archived ? 'Qaytarish' : 'Arxivga'}</button>
        </div>
      )}
      {editing && <ShopForm shop={shop} onDone={() => setEditing(false)} />}
      <ErrorBox className="mt-2">{error}</ErrorBox>
    </li>
  );
}
