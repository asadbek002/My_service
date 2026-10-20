'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Pencil, Phone, Plus, Send } from 'lucide-react';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { date, deviceName, fullName, initials, money, normalizePhone, phone } from '../../../lib/format';
import { downloadPdf } from '../../../lib/pdf';
import { can, paidOf, useBranding, useMe, type Customer, type Order } from '../../../lib/queries';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { FormField } from '../../../components/ui/form-field';
import { ErrorBox, Loading } from '../../../components/ui/feedback';
import { statusLabel } from '../../../components/ui/status-badge';
import { OrderList } from '../../../components/order-card';

type CustomerDetail = Customer & { orders: Omit<Order, 'customer'>[]; stats: { orders: number; devices: number; totalSpent: string; debt: string } };
type Filter = 'all' | 'unpaid' | 'debt';
const FILTERS: [Filter, string][] = [['all', 'Hammasi'], ['unpaid', "To'lanmagan"], ['debt', 'Qarzga berilgan']];
/** What is still owed on an order (cancelled orders owe nothing). */
const leftOf = (o: Omit<Order, 'customer'>) => o.status === 'CANCELLED' ? 0 : Math.max(0, Number(o.total) - paidOf(o.payments));

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: brand } = useBranding();
  const { data: c, error, isLoading } = useQuery({ queryKey: ['customers', id], queryFn: () => api<CustomerDetail>('/customers/' + id) });
  const [pdfState, setPdfState] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState(false);
  if (isLoading || !c) return <AppShell title="Mijoz" back="/customers" narrow>{error ? <ErrorBox>{errorText(error)}</ErrorBox> : <Loading />}</AppShell>;
  const debt = Number(c.stats.debt);
  // "To'lanmagan": anything still owed; "Qarzga berilgan": handed over without full payment.
  const matches = (o: Omit<Order, 'customer'>, f: Filter) => f === 'all' || (leftOf(o) > 0 && (f === 'unpaid' || o.status === 'DELIVERED'));
  const shown = c.orders.filter(o => matches(o, filter));
  const filterLabel = FILTERS.find(f => f[0] === filter)![1];

  async function pdf() {
    if (!c) return;
    setPdfState(''); setPdfBusy(true);
    try {
      const live = shown.filter(o => o.status !== 'CANCELLED');
      const total = live.reduce((s, o) => s + Number(o.total), 0);
      const paid = shown.reduce((s, o) => s + paidOf(o.payments), 0);
      const owed = shown.reduce((s, o) => s + leftOf(o), 0);
      await downloadPdf({
        fileName: `mijoz-${c.phone.replace(/\D/g, '')}${filter === 'all' ? '' : '-' + filter}-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: filter === 'all' ? 'Mijoz buyurtmalari' : `Mijoz buyurtmalari · ${filterLabel}`,
        subtitle: `${fullName(c)} · ${phone(c.phone)}`,
        ...(brand?.name ? { service: brand.name } : {}),
        sections: [
          { title: 'Umumiy', summary: [
            ['Buyurtmalar soni', String(shown.length)],
            ['Jami summa', money(total) + " so'm"],
            ["To'lagan", money(paid) + " so'm"],
            [filter === 'debt' ? 'Qarz' : 'Qoldiq', money(owed) + " so'm"],
          ] },
          { title: "Buyurtmalar ro'yxati", table: {
            head: ['Sana', 'Raqam', 'Qurilma', 'Nosozlik', 'Holat', 'Jami', "To'langan", 'Qoldiq'], right: [5, 6, 7],
            rows: shown.map(o => {
              const p = paidOf(o.payments), cancelled = o.status === 'CANCELLED';
              return [date(o.createdAt), o.number, deviceName(o.device), o.complaint, statusLabel(o.status), money(o.total), money(p), cancelled ? '—' : money(leftOf(o))];
            }),
            foot: ['', '', '', '', 'Jami', money(total), money(paid), money(owed)],
          }, note: filter === 'all' ? "Jami va qoldiq — bekor qilingan buyurtmalarsiz." : `Faqat: ${filterLabel.toLowerCase()} buyurtmalar.` },
        ],
      });
    } catch (e) { setPdfState(errorText(e)); } finally { setPdfBusy(false); }
  }

  return (
    <AppShell title={fullName(c)} back="/customers" narrow>
      <div className="space-y-4">
        <section className="talon-dark on-ink overflow-hidden">
          <div className="flex items-center gap-3 p-5 sm:gap-4 sm:p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-semibold sm:h-14 sm:w-14 sm:text-lg">{initials(c)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-bold tracking-tight">{fullName(c)}</p>
              <p className="num whitespace-nowrap font-mono text-xs text-white/70 sm:text-[13px]">{phone(c.phone)}</p>
              {c.telegramChatId && <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-white/60"><Send className="h-3.5 w-3.5" /> Telegram ulangan</p>}
            </div>
            {can(me, 'customers.edit') && <button onClick={() => setEditing(v => !v)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/15" aria-label="Mijozni tahrirlash" aria-expanded={editing}><Pencil className="h-5 w-5" /></button>}
            <a href={`tel:${c.phone}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-st-tayyor text-white transition-transform active:scale-95" aria-label="Qo'ng'iroq qilish"><Phone className="h-5 w-5" /></a>
          </div>
          <div className="talon-cut" />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5 pt-4 sm:px-6">
            <div className="min-w-0"><p className="text-xs text-white/60">Buyurtma</p><p className="num mt-1 font-mono text-[15px] font-semibold sm:text-xl">{c.stats.orders}</p></div>
            <div className="min-w-0"><p className="text-xs text-white/60">To&apos;lagan</p><p className="num mt-1 font-mono text-[15px] font-semibold sm:text-xl">{money(c.stats.totalSpent)}</p></div>
            <div className="min-w-0"><p className="text-xs text-white/60">Qarz</p><p className={`num mt-1 font-mono text-[15px] font-semibold sm:text-xl ${debt > 0 ? 'text-[#FFB547]' : ''}`}>{money(debt)}</p></div>
          </div>
        </section>
        {editing && <EditCustomer customer={c} onDone={() => setEditing(false)} />}
        {can(me, 'orders.create') && (
          <Button asChild variant="brand" size="lg" className="w-full"><Link href={`/orders/new?phone=${encodeURIComponent(c.phone)}`}><Plus className="h-4 w-4" /> Yangi qabul</Link></Button>
        )}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Buyurtmalar</h2>
          {shown.length > 0 && (
            <Button variant="secondary" size="sm" disabled={pdfBusy} onClick={pdf}><FileDown className="h-4 w-4" /> {pdfBusy ? 'Tayyorlanmoqda…' : 'PDF yuklash'}</Button>
          )}
        </div>
        {c.orders.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Buyurtmalar filtri">
            {FILTERS.map(([k, l]) => {
              const n = c.orders.filter(o => matches(o, k)).length;
              return <button key={k} className="chip group" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}<span className="num font-mono text-[11px] text-mute group-aria-pressed:text-white/70">{n}</span></button>;
            })}
          </div>
        )}
        <ErrorBox>{pdfState}</ErrorBox>
        {shown.length > 0 ? <OrderList orders={shown.map(o => ({ ...o, customer: c }))} /> : c.orders.length > 0 && <p className="rounded-2xl border border-dashed py-8 text-center text-sm text-mute">{filter === 'debt' ? "Qarzga berilgan buyurtma yo'q" : "To'lanmagan buyurtma yo'q"}</p>}
      </div>
    </AppShell>
  );
}

/** Fix a name or phone typed wrong at intake. A changed phone unlinks the old Telegram chat. */
function EditCustomer({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(customer.firstName);
  const [lastName, setLastName] = useState(customer.lastName ?? '');
  const [phoneInput, setPhoneInput] = useState(phone(customer.phone));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const newPhone = normalizePhone(phoneInput);
    if (!firstName.trim()) return setError('Ismni yozing');
    if (!/^\+[1-9][0-9]{7,14}$/.test(newPhone)) return setError("Telefon raqami noto'g'ri");
    if (newPhone !== customer.phone && customer.telegramChatId && !window.confirm("Telefon o'zgarsa, mijoz Telegram botdan uziladi va yangi raqam bilan qayta ulanishi kerak. Davom etasizmi?")) return;
    setBusy(true); setError('');
    try {
      await api('/customers/' + customer.id, { method: 'PATCH', body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: newPhone }) });
      await Promise.all([qc.invalidateQueries({ queryKey: ['customers'] }), qc.invalidateQueries({ queryKey: ['orders'] })]);
      onDone();
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="grid gap-3 rounded-2xl border bg-white p-4 sm:p-5" noValidate>
      <h2 className="font-bold">Mijozni tahrirlash</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Ism"><Input value={firstName} onChange={e => setFirstName(e.target.value)} autoCapitalize="words" autoFocus /></FormField>
        <FormField label="Familiya"><Input value={lastName} onChange={e => setLastName(e.target.value)} autoCapitalize="words" /></FormField>
      </div>
      <FormField label="Telefon"><Input value={phoneInput} onChange={e => setPhoneInput(e.target.value)} inputMode="tel" className="num font-mono" /></FormField>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>
        <Button type="button" variant="secondary" onClick={onDone}>Bekor</Button>
      </div>
    </form>
  );
}
