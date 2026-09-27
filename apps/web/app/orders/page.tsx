'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { can, useMe, useOrders } from '../../lib/queries';
import { errorText } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { OrderCard } from '../../components/order-card';

const FILTERS = [
  ['open', 'Ochiq'], ['RECEIVED', 'Qabul qilingan'], ['IN_REPAIR', "Ta'mirda"], ['READY', 'Tayyor'],
  ['DELIVERED', 'Berilgan'], ['CANCELLED', 'Bekor'], ['', 'Hammasi'],
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
      <Button asChild size="sm" className="hidden lg:inline-flex"><Link href="/orders/new"><Plus className="h-4 w-4" /> Yangi qabul</Link></Button>
    )}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 lg:mx-0 lg:flex-wrap lg:px-0">
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => router.replace(key === 'open' ? '/orders' : '/orders?status=' + key)} aria-pressed={filter === key}
            className={cn('h-9 shrink-0 rounded-full border px-3.5 text-sm', filter === key ? 'border-ink bg-ink text-white' : 'bg-white')}>{label}</button>
        ))}
      </div>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Raqam, ism, telefon yoki model" className="mb-4" type="search" />
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={5} /> : shown.length === 0 ? (
        <Empty title={q ? 'Hech narsa topilmadi' : 'Bu yerda buyurtma yo‘q'}>
          {!q && can(me, 'orders.create') && <Link href="/orders/new" className="font-medium text-ink underline">Yangi qabul qilish</Link>}
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map(o => <OrderCard key={o.id} order={o} />)}</div>
      )}
    </AppShell>
  );
}
