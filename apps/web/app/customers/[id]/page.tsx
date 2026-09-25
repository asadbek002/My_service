'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardContent } from '../../../components/ui/card';

type Payment = { id: string; kind: string; amount: string; method: string; createdAt: string };
type Order = { id: string; number: string; status: string; total: string; createdAt: string; device: { brand: string; model: string }; payments: Payment[] };
type Customer = {
  id: string; firstName: string; lastName?: string | null; phone: string; notes?: string | null; telegramChatId?: string | null; telegramUsername?: string | null;
  devices: { id: string; brand: string; model: string; imei?: string | null; category: string }[];
  orders: Order[];
  stats: { orders: number; devices: number; totalSpent: string; debt: string };
  notifications: { id: string; type: string; channel?: string | null; status: string; createdAt: string; orderId: string }[];
};
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + " so'm";
const TABS = [['devices', 'Qurilmalar'], ['orders', 'Buyurtmalar'], ['payments', "To'lovlar"], ['messages', 'Xabarlar']] as const;

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('orders');
  const { data: c, error, isLoading } = useQuery({ queryKey: ['customers', id], queryFn: () => api<Customer>('/customers/' + id), enabled: !!id });
  const back = <Link href="/customers"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Mijozlar</Button></Link>;
  if (isLoading) return <AppShell title="Mijoz" action={back}><p className="p-10 text-center text-sm text-zinc-400">Yuklanmoqda...</p></AppShell>;
  if (!c) return <AppShell title="Mijoz" action={back}><p className="p-10 text-center text-sm text-red-500">{error?.message ?? 'Mijoz topilmadi'}</p></AppShell>;
  const orderNumber = Object.fromEntries(c.orders.map(o => [o.id, o.number]));
  const payments = c.orders.flatMap(o => o.payments.map(p => ({ ...p, order: o }))).sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  return (
    <AppShell title={`${c.firstName} ${c.lastName ?? ''}`.trim()} subtitle="Mijoz profili" action={back}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            ['Telefon', c.phone],
            ['Telegram', c.telegramChatId ? '🟢 Ulangan' : '⚪ Ulanmagan'],
            ['Murojaatlar', String(c.stats.orders)],
            ['Jami xarid', money(c.stats.totalSpent)],
            ['Qarzdorlik', money(c.stats.debt)],
          ].map(([label, value]) => (
            <Card key={label}><CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">{label}</p>
              <p className={`text-lg font-bold mt-1 ${label === 'Qarzdorlik' && Number(c.stats.debt) > 0 ? 'text-red-600' : ''}`}>{value}</p>
            </CardContent></Card>
          ))}
        </div>
        {c.notes && <p className="text-sm p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">{c.notes}</p>}

        <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap ${tab === key ? 'border-zinc-900 dark:border-zinc-50' : 'border-transparent text-zinc-500'}`}>{label}</button>
          ))}
        </div>

        <Card><CardContent className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800 text-sm">
          {tab === 'devices' && (c.devices.length ? c.devices.map(d => (
            <Link key={d.id} href={'/devices/' + d.id} className="p-4 flex justify-between hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <span className="font-semibold">{d.brand} {d.model} <span className="text-zinc-400 font-normal">· {d.category}</span></span>
              <span className="text-xs text-zinc-500">{d.imei || 'IMEI yo‘q'}</span>
            </Link>
          )) : <p className="p-6 text-center text-zinc-400">Qurilma yo&apos;q</p>)}
          {tab === 'orders' && (c.orders.length ? c.orders.map(o => (
            <Link key={o.id} href={'/orders/' + o.id} className="p-4 flex flex-wrap items-center justify-between gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <span><b className="font-mono">{o.number}</b> · {o.device.brand} {o.device.model}<span className="block text-xs text-zinc-400">{new Date(o.createdAt).toLocaleDateString('ru-RU')} · {money(o.total)}</span></span>
              <StatusBadge status={o.status} />
            </Link>
          )) : <p className="p-6 text-center text-zinc-400">Buyurtma yo&apos;q</p>)}
          {tab === 'payments' && (payments.length ? payments.map(p => (
            <div key={p.id} className="p-4 flex justify-between gap-2">
              <span><Link href={'/orders/' + p.order.id} className="font-mono font-semibold hover:underline">{p.order.number}</Link><span className="block text-xs text-zinc-400">{new Date(p.createdAt).toLocaleString('ru-RU')} · {p.method}</span></span>
              <b className={p.kind === 'REFUND' ? 'text-red-600' : 'text-emerald-700'}>{p.kind === 'REFUND' ? '−' : '+'}{money(p.amount)}</b>
            </div>
          )) : <p className="p-6 text-center text-zinc-400">To&apos;lov yo&apos;q</p>)}
          {tab === 'messages' && (c.notifications.length ? c.notifications.map(n => (
            <div key={n.id} className="p-4 flex justify-between gap-2">
              <span><b>{n.type}</b><span className="block text-xs text-zinc-400">{new Date(n.createdAt).toLocaleString('ru-RU')} · {orderNumber[n.orderId] ?? ''}</span></span>
              <span className="text-xs text-right">{n.channel ?? '—'}<span className={`block font-semibold ${n.status === 'SENT' ? 'text-emerald-600' : n.status === 'FAILED' ? 'text-red-600' : 'text-zinc-500'}`}>{n.status === 'SENT' ? '✓ Yetkazildi' : n.status === 'FAILED' ? '✕ Xato' : n.status === 'SKIPPED' ? 'O‘tkazildi' : 'Navbatda'}</span></span>
            </div>
          )) : <p className="p-6 text-center text-zinc-400">Xabar yuborilmagan</p>)}
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
