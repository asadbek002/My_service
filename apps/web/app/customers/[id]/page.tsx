'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Phone, Plus, Send } from 'lucide-react';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { fullName, money, phone } from '../../../lib/format';
import { can, useMe, type Customer, type Order } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { ErrorBox, Loading } from '../../../components/ui/feedback';
import { OrderCard } from '../../../components/order-card';

type CustomerDetail = Customer & { orders: Omit<Order, 'customer'>[]; stats: { orders: number; devices: number; totalSpent: string; debt: string } };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: c, error, isLoading } = useQuery({ queryKey: ['customers', id], queryFn: () => api<CustomerDetail>('/customers/' + id) });
  if (isLoading || !c) return <AppShell title="Mijoz" back="/customers" narrow>{error ? <ErrorBox>{errorText(error)}</ErrorBox> : <Loading />}</AppShell>;
  const debt = Number(c.stats.debt);
  return (
    <AppShell title={fullName(c)} back="/customers" narrow>
      <div className="space-y-4">
        <section className="talon">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <a href={`tel:${c.phone}`} className="num inline-flex items-center gap-2 font-mono font-medium"><Phone className="h-4 w-4" />{phone(c.phone)}</a>
              {c.telegramChatId && <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-mute"><Send className="h-3.5 w-3.5" /> Telegram ulangan</p>}
            </div>
            {can(me, 'orders.create') && (
              <Button asChild size="sm"><Link href={`/orders/new?phone=${encodeURIComponent(c.phone)}`}><Plus className="h-4 w-4" /> Yangi qabul</Link></Button>
            )}
          </div>
          <div className="talon-cut" />
          <div className="grid grid-cols-3 divide-x text-center">
            <div className="p-3"><p className="num font-mono font-semibold">{c.stats.orders}</p><p className="text-xs text-mute">buyurtma</p></div>
            <div className="p-3"><p className="num font-mono font-semibold">{money(c.stats.totalSpent)}</p><p className="text-xs text-mute">to&apos;lagan</p></div>
            <div className="p-3"><p className={`num font-mono font-semibold ${debt > 0 ? 'text-amber-700' : ''}`}>{money(debt)}</p><p className="text-xs text-mute">qarz</p></div>
          </div>
        </section>
        <h2 className="font-semibold">Buyurtmalar</h2>
        <div className="grid gap-3">
          {c.orders.map(o => <OrderCard key={o.id} order={{ ...o, customer: c }} />)}
        </div>
      </div>
    </AppShell>
  );
}
