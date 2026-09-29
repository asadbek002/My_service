'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Printer, Phone, Pencil, Share2, Undo2, Ban, ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { errorText } from '../../../lib/errors';
import { date, dateTime, deviceName, fullName, idempotencyKey, money, phone, PAYMENT_METHODS, som } from '../../../lib/format';
import { can, post, useMe, useOrder, useOrderMutation, usePaymentMethods, type OrderDetail, type Payment } from '../../../lib/queries';
import { cn } from '../../../lib/utils';
import { AppShell, ActionBar } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { MoneyInput } from '../../../components/ui/money-input';
import { StatusBadge, statusLabel } from '../../../components/ui/status-badge';
import { ErrorBox, Loading, Notice, Row } from '../../../components/ui/feedback';
import { PartRow, type SourcedPart } from '../../../components/part-row';

const OPEN = ['RECEIVED', 'IN_REPAIR', 'READY'];
type Panel = null | 'pay' | 'deliver' | 'price' | 'cancel';

export default function Page() {
  return <Suspense><OrderPage /></Suspense>;
}

function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const justCreated = useSearchParams().get('new') === '1';
  const { data: me } = useMe();
  const { data: order, isLoading, error: loadError } = useOrder(id);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const status = useOrderMutation((v: { status: string; comment?: string }) => post(`/orders/${id}/status`, v, 'PATCH'));
  async function move(to: string, comment?: string) {
    setError(''); setNotice('');
    try {
      await status.mutateAsync({ status: to, ...(comment ? { comment } : {}) });
      setPanel(null);
      setNotice(to === 'READY' ? 'Tayyor. Mijozga xabar yuborildi.' : 'Holat: ' + statusLabel(to));
    } catch (e) { setError(errorText(e)); }
  }

  if (isLoading || !order) {
    return <AppShell title="Buyurtma" back="/orders" narrow>{loadError ? <ErrorBox>{errorText(loadError)}</ErrorBox> : <Loading rows={4} />}</AppShell>;
  }

  const balance = Number(order.balance);
  const isOpen = OPEN.includes(order.status);
  const canStatus = can(me, 'orders.change_status');
  const canEdit = can(me, 'orders.edit');
  const canPay = can(me, 'payments.create') && order.status !== 'CANCELLED' && balance > 0;
  const toggle = (p: Panel) => { setError(''); setNotice(''); setPanel(panel === p ? null : p); };

  return (
    <AppShell title={order.number} back="/orders" narrow action={
      <Link href={`/orders/${id}/print${order.status === 'DELIVERED' ? '?type=delivery' : ''}`} className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-black/[0.05]" aria-label="Chek chiqarish" title="Chek chiqarish">
        <Printer className="h-5 w-5" />
      </Link>
    }>
      <div className="space-y-4">
        {justCreated && (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-emerald-900">Qurilma qabul qilindi. Mijozga chek bering.</p>
            <Button asChild variant="success" size="sm"><Link href={`/orders/${id}/print`}><Printer className="h-4 w-4" /> Chek chiqarish</Link></Button>
          </div>
        )}

        <Ticket order={order} canEditPrice={canEdit && isOpen} onEditPrice={() => toggle('price')} />

        {panel === 'price' && <PriceForm order={order} onDone={() => { setPanel(null); setNotice('Narx yangilandi'); }} />}
        {panel === 'pay' && <PaymentForm order={order} onDone={() => { setPanel(null); setNotice("To'lov qabul qilindi"); }} />}
        {panel === 'deliver' && <DeliverForm order={order} allowDebt={can(me, 'payments.deliver_with_debt')} onDone={() => { setPanel(null); setNotice('Qurilma mijozga berildi'); }} />}
        {panel === 'cancel' && <CancelForm busy={status.isPending} onCancel={comment => move('CANCELLED', comment)} onClose={() => setPanel(null)} />}

        <ErrorBox>{error}</ErrorBox>
        <Notice>{notice}</Notice>

        {/* Less common moves: step back, cancel, share the tracking link. */}
        <div className="flex flex-wrap gap-2">
          {canStatus && order.status === 'IN_REPAIR' && <Button variant="secondary" size="sm" onClick={() => move('RECEIVED')}><Undo2 className="h-4 w-4" /> Qabulga qaytarish</Button>}
          {canStatus && order.status === 'READY' && <Button variant="secondary" size="sm" onClick={() => move('IN_REPAIR')}><Undo2 className="h-4 w-4" /> Ta&apos;mirga qaytarish</Button>}
          {canEdit && isOpen && <ShareLink orderId={id} />}
          {canStatus && isOpen && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => toggle('cancel')}><Ban className="h-4 w-4" /> Bekor qilish</Button>}
        </div>

        <Payments order={order} canRefund={can(me, 'payments.refund')} />
        <OrderParts orderId={id} canAdd={canEdit && isOpen} canEdit={canEdit} />
        {order.warranty && (
          <section className="flex gap-3 rounded-lg border bg-white p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Kafolat {date(order.warranty.endDate)} gacha</p>
              {order.warranty.terms && <p className="mt-1 text-mute">{order.warranty.terms}</p>}
            </div>
          </section>
        )}
        <History order={order} />
      </div>

      {(canStatus || canPay || canEdit) && (order.status !== 'CANCELLED') && (order.status !== 'DELIVERED' || canPay) && (
        <ActionBar>
          {order.status === 'RECEIVED' && canStatus && <>
            <Button variant="secondary" size="lg" disabled={status.isPending} onClick={() => move('READY')}>Tayyor</Button>
            <Button variant="brand" size="lg" disabled={status.isPending} onClick={() => move('IN_REPAIR')}>Ta&apos;mirga olish</Button>
          </>}
          {order.status === 'IN_REPAIR' && canStatus && <Button size="lg" variant="success" disabled={status.isPending} onClick={() => move('READY')}>Tayyor</Button>}
          {order.status === 'READY' && <>
            {canPay && <Button variant="secondary" size="lg" onClick={() => toggle('pay')}>To&apos;lov</Button>}
            {canEdit && <Button variant="brand" size="lg" onClick={() => toggle('deliver')}>Mijozga berish</Button>}
          </>}
          {order.status === 'DELIVERED' && canPay && <Button variant="brand" size="lg" onClick={() => toggle('pay')}>Qarzni to&apos;lash</Button>}
          {(order.status === 'RECEIVED' || order.status === 'IN_REPAIR') && canPay && !canStatus && <Button variant="brand" size="lg" onClick={() => toggle('pay')}>To&apos;lov</Button>}
        </ActionBar>
      )}
    </AppShell>
  );
}

/** The repair talon: who, what, what's wrong — then the money, below the tear line. */
function Ticket({ order, canEditPrice, onEditPrice }: { order: OrderDetail; canEditPrice: boolean; onEditPrice: () => void }) {
  const balance = Number(order.balance);
  return (
    <article className="talon">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="num font-mono text-lg font-semibold tracking-tight">{order.number}</p>
            <p className="text-xs text-mute">Qabul: {dateTime(order.createdAt)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="eyebrow">Mijoz</p>
            <Link href={`/customers/${order.customer.id}`} className="mt-0.5 block truncate font-medium hover:underline">{fullName(order.customer)}</Link>
            <a href={`tel:${order.customer.phone}`} className="num inline-flex items-center gap-1.5 font-mono text-sm text-mute hover:text-ink"><Phone className="h-3.5 w-3.5" />{phone(order.customer.phone)}</a>
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Qurilma</p>
            <p className="mt-0.5 truncate font-medium">{deviceName(order.device)}</p>
            <p className="text-sm text-mute">{order.device.category}</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="eyebrow">Nosozlik</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{order.complaint}</p>
        </div>
        {order.accessories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {order.accessories.map(a => <span key={a} className="rounded-full border px-2.5 py-0.5 text-xs">{a}</span>)}
          </div>
        )}
      </div>
      <div className="talon-cut" />
      <div className="p-4">
        <Row label="Usta haqi">{money(order.labor)}</Row>
        <Row label="Zapchast">{money(order.partsTotal)}</Row>
        <Row label="Jami" strong>{som(order.total)}</Row>
        <div className="mt-2 border-t pt-2">
          <Row label="To'langan">{money(order.totalPaid)}</Row>
          <Row label="Qoldiq" className={balance > 0 ? 'text-amber-700' : ''}><span className={balance > 0 ? 'font-semibold text-amber-700' : ''}>{money(order.balance)}</span></Row>
        </div>
        {canEditPrice && (
          <button onClick={onEditPrice} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"><Pencil className="h-3.5 w-3.5" /> Narxni o&apos;zgartirish</button>
        )}
      </div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border-2 border-ink bg-white p-4"><h2 className="mb-3 font-semibold">{title}</h2>{children}</section>;
}

function PriceForm({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [labor, setLabor] = useState(String(Math.round(Number(order.labor))));
  const [parts, setParts] = useState(String(Math.round(Number(order.partsTotal))));
  const [error, setError] = useState('');
  const save = useOrderMutation(() => post(`/orders/${order.id}/price`, { labor: labor || '0', partsTotal: parts || '0' }, 'PATCH'));
  return (
    <Panel title="Narx">
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5"><span className="text-sm font-medium">Usta haqi</span><MoneyInput value={labor} onChange={setLabor} autoFocus /></label>
        <label className="grid gap-1.5"><span className="text-sm font-medium">Zapchast</span><MoneyInput value={parts} onChange={setParts} /></label>
      </div>
      <p className="mt-3 text-sm">Jami: <b className="num font-mono">{som((Number(labor) || 0) + (Number(parts) || 0))}</b></p>
      <ErrorBox className="mt-3">{error}</ErrorBox>
      <Button className="mt-3 w-full sm:w-auto" disabled={save.isPending} onClick={async () => { setError(''); try { await save.mutateAsync(undefined); onDone(); } catch (e) { setError(errorText(e)); } }}>Saqlash</Button>
    </Panel>
  );
}

function MethodPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: custom = [] } = usePaymentMethods();
  const methods = [...['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER'].map(k => ({ key: k, label: PAYMENT_METHODS[k]! })), ...custom];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="To'lov usuli">
      {methods.map(m => (
        <button key={m.key} type="button" role="radio" aria-checked={value === m.key} onClick={() => onChange(m.key)}
          className="chip">{m.label}</button>
      ))}
    </div>
  );
}

function PaymentForm({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.max(0, Math.round(Number(order.balance)))));
  const [method, setMethod] = useState('CASH');
  const [key] = useState(idempotencyKey);
  const [error, setError] = useState('');
  const pay = useOrderMutation(() => post(`/orders/${order.id}/payments`, { amount, method, idempotencyKey: key }));
  return (
    <Panel title="To'lov qabul qilish">
      <div className="space-y-3">
        <label className="grid gap-1.5"><span className="text-sm font-medium">Summa <span className="font-normal text-mute">(qoldiq {money(order.balance)})</span></span><MoneyInput value={amount} onChange={setAmount} autoFocus /></label>
        <MethodPicker value={method} onChange={setMethod} />
        <ErrorBox>{error}</ErrorBox>
        <Button className="w-full sm:w-auto" disabled={pay.isPending || !Number(amount)} onClick={async () => { setError(''); try { await pay.mutateAsync(undefined); onDone(); } catch (e) { setError(errorText(e)); } }}>
          {som(amount)} qabul qilish
        </Button>
      </div>
    </Panel>
  );
}

const WARRANTY_DAYS = [0, 7, 14, 30, 90, 180];
function DeliverForm({ order, allowDebt, onDone }: { order: OrderDetail; allowDebt: boolean; onDone: () => void }) {
  const balance = Number(order.balance);
  const [days, setDays] = useState(30);
  const [custom, setCustom] = useState('');
  const [payNow, setPayNow] = useState(balance > 0);
  const [method, setMethod] = useState('CASH');
  const [key] = useState(idempotencyKey);
  const [error, setError] = useState('');
  const warrantyDays = custom ? Math.min(1095, Number(custom)) : days;
  const deliver = useOrderMutation(async () => {
    // Taking the rest of the money and handing over are one step at the counter.
    if (balance > 0 && payNow) await post(`/orders/${order.id}/payments`, { amount: String(Math.round(balance * 100) / 100), method, idempotencyKey: key });
    return post(`/orders/${order.id}/deliver`, { warrantyDays, ...(balance > 0 && !payNow ? { allowDebt: true } : {}) });
  });
  return (
    <Panel title="Mijozga berish">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Kafolat necha kun?</p>
          <div className="flex flex-wrap gap-2">
            {WARRANTY_DAYS.map(d => (
              <button key={d} type="button" onClick={() => { setDays(d); setCustom(''); }} aria-pressed={!custom && days === d}
                className="chip min-w-[3rem] justify-center px-3">
                {d === 0 ? "Yo'q" : d + ' kun'}
              </button>
            ))}
            <Input value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="Boshqa" aria-label="Kafolat kunlari" className="h-9 w-24 sm:h-9" />
          </div>
        </div>
        {balance > 0 && (
          <div className="rounded-md bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">Qoldiq: {som(balance)}</p>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={payNow} onChange={() => setPayNow(true)} className="h-4 w-4" /> Hozir to&apos;laydi</label>
            {payNow && <div className="mt-2 pl-6"><MethodPicker value={method} onChange={setMethod} /></div>}
            {allowDebt && <label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={!payNow} onChange={() => setPayNow(false)} className="h-4 w-4" /> Qarzga beriladi</label>}
          </div>
        )}
        <ErrorBox>{error}</ErrorBox>
        <Button className="w-full sm:w-auto" disabled={deliver.isPending || (balance > 0 && !payNow && !allowDebt)} onClick={async () => { setError(''); try { await deliver.mutateAsync(undefined); onDone(); } catch (e) { setError(errorText(e)); } }}>
          {deliver.isPending ? 'Saqlanmoqda…' : 'Berildi deb belgilash'}
        </Button>
      </div>
    </Panel>
  );
}

function CancelForm({ busy, onCancel, onClose }: { busy: boolean; onCancel: (comment: string) => void; onClose: () => void }) {
  const [comment, setComment] = useState('');
  return (
    <section className="rounded-lg border-2 border-red-600 bg-white p-4">
      <h2 className="font-semibold">Buyurtmani bekor qilasizmi?</h2>
      <p className="mt-1 text-sm text-mute">Bekor qilingan buyurtmani qayta ochib bo&apos;lmaydi.</p>
      <Input className="mt-3" value={comment} onChange={e => setComment(e.target.value)} placeholder="Sababi (masalan: mijoz rozi bo'lmadi)" />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={onClose}>Yo&apos;q</Button>
        <Button variant="destructive" disabled={busy} onClick={() => onCancel(comment.trim())}>Bekor qilish</Button>
      </div>
    </section>
  );
}

function ShareLink({ orderId }: { orderId: string }) {
  const [state, setState] = useState('');
  async function share() {
    setState('');
    try {
      const { tracking } = await api<{ tracking: string }>(`/orders/${orderId}/links`, { method: 'POST' });
      if (navigator.share) { await navigator.share({ title: 'Buyurtma holati', url: tracking }).catch(() => undefined); return; }
      await navigator.clipboard.writeText(tracking);
      setState('Nusxalandi');
    } catch (e) { setState(errorText(e)); }
  }
  return <Button variant="secondary" size="sm" onClick={share}><Share2 className="h-4 w-4" /> {state || 'Holat havolasi'}</Button>;
}

function Payments({ order, canRefund }: { order: OrderDetail; canRefund: boolean }) {
  const [refunding, setRefunding] = useState<string | null>(null);
  if (order.payments.length === 0) return null;
  const refunded = (p: Payment) => order.payments.filter(r => r.kind === 'REFUND' && r.originalPaymentId === p.id).reduce((s, r) => s + Number(r.amount), 0);
  return (
    <section className="rounded-lg border bg-white">
      <h2 className="border-b px-4 py-3 font-semibold">To&apos;lovlar</h2>
      <ul className="divide-y">
        {order.payments.map(p => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.kind === 'REFUND' ? 'Qaytarildi' : PAYMENT_METHODS[p.method] ?? p.method}</p>
                <p className="truncate text-xs text-mute">{dateTime(p.createdAt)}{p.actorId && order.actorNames[p.actorId] ? ' · ' + order.actorNames[p.actorId] : ''}{p.reason ? ' · ' + p.reason : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('num font-mono text-sm font-semibold', p.kind === 'REFUND' && 'text-red-600')}>{p.kind === 'REFUND' ? '−' : ''}{money(p.amount)}</span>
                {canRefund && p.kind === 'PAYMENT' && refunded(p) < Number(p.amount) && (
                  <button onClick={() => setRefunding(refunding === p.id ? null : p.id)} className="rounded p-1 text-mute hover:text-ink" aria-label="Qaytarish" title="Qaytarish"><Undo2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
            {refunding === p.id && <RefundForm payment={p} max={Number(p.amount) - refunded(p)} onDone={() => setRefunding(null)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RefundForm({ payment, max, onDone }: { payment: Payment; max: number; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(max)));
  const [reason, setReason] = useState('');
  const [key] = useState(idempotencyKey);
  const [error, setError] = useState('');
  const refund = useOrderMutation(() => post(`/payments/${payment.id}/refund`, { amount, reason: reason.trim(), idempotencyKey: key }));
  return (
    <div className="mt-3 space-y-2 rounded-md bg-paper p-3">
      <MoneyInput value={amount} onChange={setAmount} aria-label="Qaytariladigan summa" />
      <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Sababi" />
      <ErrorBox>{error}</ErrorBox>
      <Button size="sm" variant="destructive" disabled={refund.isPending || reason.trim().length < 3 || !Number(amount)} onClick={async () => { setError(''); try { await refund.mutateAsync(undefined); onDone(); } catch (e) { setError(errorText(e)); } }}>Pulni qaytarish</Button>
    </div>
  );
}

function History({ order }: { order: OrderDetail }) {
  return (
    <section className="rounded-lg border bg-white">
      <h2 className="border-b px-4 py-3 font-semibold">Tarix</h2>
      <ol className="px-4 py-2">
        {[...order.history].reverse().map(h => (
          <li key={h.id} className="flex gap-3 py-2">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink/30" />
            <div className="min-w-0 text-sm">
              <p><b className="font-medium">{statusLabel(h.toStatus)}</b>{h.actorId && order.actorNames[h.actorId] ? <span className="text-mute"> · {order.actorNames[h.actorId]}</span> : null}</p>
              <p className="text-xs text-mute">{dateTime(h.createdAt)}{h.comment ? ' · ' + h.comment : ''}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Parts brought from shops for this repair: what they cost the shop and whether they are settled. */
function OrderParts({ orderId, canAdd, canEdit }: { orderId: string; canAdd: boolean; canEdit: boolean }) {
  const { data } = useQuery({ queryKey: ['parts', 'order', orderId], queryFn: () => api<{ items: SourcedPart[] }>('/parts?orderId=' + orderId) });
  const items = data?.items ?? [];
  if (!items.length && !canAdd) return null;
  const cost = items.filter(p => p.status !== 'RETURNED').reduce((s, p) => s + Number(p.cost), 0);
  return (
    <section className="rounded-lg border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-semibold">Zapchastlar {cost > 0 && <span className="num font-mono text-sm font-normal text-mute">· tannarx {money(cost)}</span>}</h2>
        {canAdd && <Link href={`/parts?order=${orderId}`} className="text-sm font-medium underline">Qo&apos;shish</Link>}
      </div>
      {items.length ? <ul className="divide-y">{items.map(p => <PartRow key={p.id} part={p} canEdit={canEdit} compact />)}</ul>
        : <p className="px-4 py-4 text-sm text-mute">Do&apos;kondan zapchast olinsa, shu yerda ko&apos;rinadi.</p>}
    </section>
  );
}
