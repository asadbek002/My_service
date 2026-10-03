'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Phone, Plus, Send } from 'lucide-react';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { date, deviceName, fullName, money, phone } from '../../../lib/format';
import { downloadPdf } from '../../../lib/pdf';
import { can, paidOf, useBranding, useMe, type Customer, type Order } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { ErrorBox, Loading } from '../../../components/ui/feedback';
import { statusLabel } from '../../../components/ui/status-badge';
import { OrderCard } from '../../../components/order-card';

type CustomerDetail = Customer & { orders: Omit<Order, 'customer'>[]; stats: { orders: number; devices: number; totalSpent: string; debt: string } };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: brand } = useBranding();
  const { data: c, error, isLoading } = useQuery({ queryKey: ['customers', id], queryFn: () => api<CustomerDetail>('/customers/' + id) });
  const [pdfState, setPdfState] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  if (isLoading || !c) return <AppShell title="Mijoz" back="/customers" narrow>{error ? <ErrorBox>{errorText(error)}</ErrorBox> : <Loading />}</AppShell>;
  const debt = Number(c.stats.debt);

  async function pdf() {
    if (!c) return;
    setPdfState(''); setPdfBusy(true);
    try {
      const live = c.orders.filter(o => o.status !== 'CANCELLED');
      const total = live.reduce((s, o) => s + Number(o.total), 0);
      const paid = c.orders.reduce((s, o) => s + paidOf(o.payments), 0);
      await downloadPdf({
        fileName: `mijoz-${c.phone.replace(/\D/g, '')}-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'Mijoz buyurtmalari',
        subtitle: `${fullName(c)} · ${phone(c.phone)}`,
        ...(brand?.name ? { service: brand.name } : {}),
        sections: [
          { title: 'Umumiy', summary: [
            ['Buyurtmalar soni', String(c.orders.length)],
            ['Jami summa', money(total) + " so'm"],
            ["To'lagan", money(paid) + " so'm"],
            ['Qarz', money(debt) + " so'm"],
          ] },
          { title: "Buyurtmalar ro'yxati", table: {
            head: ['Sana', 'Raqam', 'Qurilma', 'Nosozlik', 'Holat', 'Jami', "To'langan", 'Qoldiq'], right: [5, 6, 7],
            rows: c.orders.map(o => {
              const p = paidOf(o.payments), cancelled = o.status === 'CANCELLED';
              return [date(o.createdAt), o.number, deviceName(o.device), o.complaint, statusLabel(o.status), money(o.total), money(p), cancelled ? '—' : money(Math.max(0, Number(o.total) - p))];
            }),
            foot: ['', '', '', '', 'Jami', money(total), money(paid), money(debt)],
          }, note: "Jami va qoldiq — bekor qilingan buyurtmalarsiz." },
        ],
      });
    } catch (e) { setPdfState(errorText(e)); } finally { setPdfBusy(false); }
  }

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Buyurtmalar</h2>
          {c.orders.length > 1 && (
            <Button variant="secondary" size="sm" disabled={pdfBusy} onClick={pdf}><FileDown className="h-4 w-4" /> {pdfBusy ? 'Tayyorlanmoqda…' : 'PDF yuklash'}</Button>
          )}
        </div>
        <ErrorBox>{pdfState}</ErrorBox>
        <div className="grid gap-3">
          {c.orders.map(o => <OrderCard key={o.id} order={{ ...o, customer: c }} />)}
        </div>
      </div>
    </AppShell>
  );
}
