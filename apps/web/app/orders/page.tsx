'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { can, useMe, useOrders } from '../../lib/queries';
import { errorText } from '../../lib/errors';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { Input } from '../../components/ui/input';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { OrderList } from '../../components/order-card';
import { OrderTable } from '../../components/order-table';

// Each status keeps its colour everywhere (ruler, stamp, chip): grey queue, blue repair, green ready,
// amber debt. Inactive chips show a coloured dot; the chosen one is filled with its colour.
const FILTERS = [
  ['open', 'Ochiq', 'bg-ink', 'aria-pressed:border-ink aria-pressed:bg-ink'],
  ['RECEIVED', 'Qabulda', 'bg-st-qabul', 'aria-pressed:border-st-qabul-ink aria-pressed:bg-st-qabul-ink'],
  ['IN_REPAIR', "Ta'mirda", 'bg-st-tamir', 'aria-pressed:border-st-tamir aria-pressed:bg-st-tamir'],
  ['READY', 'Tayyor', 'bg-st-tayyor', 'aria-pressed:border-st-tayyor-ink aria-pressed:bg-st-tayyor-ink'],
  ['DEBT', 'Qarzga berilgan', 'bg-st-kutish', 'aria-pressed:border-st-kutish-ink aria-pressed:bg-st-kutish-ink'],
  ['DELIVERED', 'Berilgan', 'bg-mute', 'aria-pressed:border-mute aria-pressed:bg-mute'],
  ['CANCELLED', 'Bekor', 'bg-red-600', 'aria-pressed:border-red-700 aria-pressed:bg-red-700'],
  ['', 'Hammasi', 'bg-tick', 'aria-pressed:border-ink aria-pressed:bg-ink'],
] as const;

export default function Page() {
  return <Suspense><Orders /></Suspense>;
}

function Orders() {
  const router = useRouter();
  const params = useSearchParams();
  const filter = params.get('status') ?? 'open';
  const { data: me } = useMe();
  const { data: orders, isLoading, error } = useOrders(filter);
  // Chip counts for the devices in the shop come from the open list (shared cache with the dashboard).
  const { data: open } = useOrders('open');
  const { data: debt } = useOrders('DEBT');
  const count = (key: string) => key === 'open' ? open?.length : key === 'DEBT' ? debt?.length : ['RECEIVED', 'IN_REPAIR', 'READY'].includes(key) ? open?.filter(o => o.status === key).length : undefined;
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return orders ?? [];
    const digits = text.replace(/\D/g, '');
    return (orders ?? []).filter(o =>
      o.number.toLowerCase().includes(text) || o.customer.firstName.toLowerCase().includes(text) ||
      `${o.device.brand} ${o.device.model}`.toLowerCase().includes(text) || (digits.length >= 3 && o.customer.phone.includes(digits)));
  }, [orders, q]);

  return (
    <AppShell title="Buyurtmalar" action={can(me, 'orders.create') && (
      <Button asChild variant="brand" size="sm" className="hidden lg:inline-flex"><Link href="/orders/new"><Plus className="h-4 w-4" /> Yangi qabul</Link></Button>
    )}>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 lg:mx-0 lg:flex-wrap lg:px-0">
        {FILTERS.map(([key, label, dot, active]) => {
          const n = count(key);
          return (
            <button key={key} onClick={() => router.replace(key === 'open' ? '/orders' : '/orders?status=' + key)} aria-pressed={filter === key}
              className={cn('chip group h-10 font-medium aria-pressed:text-white', active)}>
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full group-aria-pressed:bg-white', dot)} aria-hidden="true" />
              {label}
              {n !== undefined && <span className="num rounded-full bg-paper px-1.5 font-mono text-[11px] text-ink group-aria-pressed:bg-white/20 group-aria-pressed:text-white">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden="true" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Raqam, ism, telefon yoki model" className="h-12 rounded-2xl pl-10 lg:h-11" type="search" aria-label="Buyurtmalardan qidirish" />
      </div>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={5} /> : shown.length === 0 ? (
        <Empty title={q ? 'Hech narsa topilmadi' : 'Bu yerda buyurtma yo‘q'}>
          {!q && can(me, 'orders.create') && <Link href="/orders/new" className="font-medium text-ink underline">Yangi qabul qilish</Link>}
        </Empty>
      ) : (
        <>
          <div className="lg:hidden"><OrderList orders={shown} /></div>
          <div className="hidden lg:block"><OrderTable orders={shown} /></div>
          <p className="mt-3 text-center text-xs text-mute">{shown.length} ta buyurtma</p>
        </>
      )}
    </AppShell>
  );
}
