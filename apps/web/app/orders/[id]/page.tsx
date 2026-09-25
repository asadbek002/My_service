'use client';

import React, { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Wrench, Clock, Play, Pause, CheckCircle2, AlertCircle, Printer, CreditCard, Smartphone,
  ShieldCheck, Send, Link as LinkIcon, PackagePlus, CheckSquare, AlertTriangle, UserPlus, History,
  Image as ImageIcon, Undo2, XCircle, Hammer,
} from 'lucide-react';
import { useMe, useCreatePayment, useDownloadDocument } from '../../../lib/queries';
import { diagnosisSchema, paymentSchema, type DiagnosisInput, type PaymentInput } from '../../../lib/schemas';
import { api, uploadAttachment } from '../../../lib/api';
import { AppShell } from '../../../components/layout/app-shell';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { Select } from '../../../components/ui/select';
import { FormField } from '../../../components/ui/form-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';

type OrderPart = { id: string; partId: string; quantity: number; status: string; unitPrice: string; part: { id: string; name: string; sku: string } };
type RepairAction = { id: string; description: string; laborAmount: string; userId: string };
type Payment = { id: string; kind: string; amount: string; method: string; reason?: string | null; originalPaymentId?: string | null; createdAt: string };
type Session = { id: string; userId: string; startedAt: string; endedAt: string | null };
type OrderDetail = {
  id: string; number: string; status: string; branchId: string; createdAt: string;
  complaint: string; accessories: string[]; condition: string[];
  diagnosis?: string | null; requiredWork?: string | null; estimatedTime?: string | null;
  quoteVersion: number; approvedVersion?: number | null; approvalStatus: string; approvalChannel?: string | null;
  labor: string; partsTotal: string; total: string; balance: string; totalPaid: string;
  customer: { id: string; firstName: string; lastName?: string | null; phone: string; telegramChatId?: string | null };
  device: { id: string; brand: string; model: string; imei?: string | null; serialNumber?: string | null; color?: string | null };
  assignments: { userId: string; task: string; user: { firstName: string; lastName?: string | null } }[];
  history: { id: string; fromStatus?: string | null; toStatus: string; actorId: string; comment?: string | null; createdAt: string }[];
  parts: OrderPart[]; repairActions: RepairAction[]; payments: Payment[]; repairSessions: Session[];
  warranty?: { id: string; startDate: string; endDate: string; terms: string } | null;
  finalTestChecklist: string[]; actorNames: Record<string, string>;
};
type InventoryPart = { id: string; name: string; sku: string; salePrice: string; stocks: { branchId: string; onHand: number; reserved: number }[] };
type Attachment = { id: string; kind: string; contentType: string; size: number; createdAt: string };

const STEPS = ['RECEIVED', 'DIAGNOSING', 'WAITING_CUSTOMER_APPROVAL', 'WAITING_PART', 'IN_REPAIR', 'READY', 'DELIVERED'];
const STEP_LABEL: Record<string, string> = {
  RECEIVED: 'Qabul', DIAGNOSING: 'Diagnostika', WAITING_CUSTOMER_APPROVAL: 'Tasdiq', WAITING_PART: 'Detal',
  IN_REPAIR: "Ta'mir", READY: 'Tayyor', DELIVERED: 'Berildi', CANCELLED: 'Bekor qilindi', UNREPAIRABLE: "Tuzatib bo'lmadi",
};
// Mirrors the backend transition table for manual status changes.
const MANUAL_TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['CANCELLED'],
  DIAGNOSING: ['CANCELLED', 'UNREPAIRABLE'],
  WAITING_CUSTOMER_APPROVAL: ['CANCELLED', 'UNREPAIRABLE'],
  WAITING_PART: ['CANCELLED'],
  IN_REPAIR: ['WAITING_PART', 'CANCELLED', 'UNREPAIRABLE'],
};
const BUILT_IN_METHODS: [string, string][] = [['CASH', 'Naqd'], ['CARD', 'Karta'], ['CLICK', 'Click'], ['PAYME', 'Payme'], ['TRANSFER', "Bank o'tkazmasi"], ['OTHER', 'Boshqa']];
const PART_STATUS: Record<string, string> = { RESERVED: 'Rezervda', USED: "O'rnatildi", RELEASED: 'Bekor qilindi', RETURNED: 'Omborga qaytarildi' };
const PHOTO_KINDS: [string, string][] = [['FRONT', 'Old'], ['BACK', 'Orqa'], ['LEFT', 'Chap'], ['RIGHT', "O'ng"], ['DAMAGE', 'Shikast'], ['OTHER', 'Boshqa']];
const CLOSED = ['DELIVERED', 'CANCELLED', 'UNREPAIRABLE'];

const money = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('ru-RU') + " so'm";
const dateTime = (v: string) => new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const duration = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
};
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)) + '-ms';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const can = (p: string) => me?.permissions.includes(p) ?? false;

  const orderQuery = useQuery({ queryKey: ['orders', id], queryFn: () => api<OrderDetail>('/orders/' + id), enabled: !!id });
  const order = orderQuery.data;
  const technicians = useQuery({ queryKey: ['technicians'], queryFn: () => api<{ id: string; firstName: string }[]>('/orders/technicians'), enabled: can('orders.assign') });
  const inventory = useQuery({ queryKey: ['parts'], queryFn: () => api<InventoryPart[]>('/inventory'), enabled: can('inventory.view'), retry: false });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => api<{ key: string; label: string }[]>('/settings/payment-methods') });
  const defaults = useQuery({ queryKey: ['settings', 'defaults'], queryFn: () => api<{ warrantyTerms: string }>('/settings/defaults') });
  const attachments = useQuery({ queryKey: ['orders', id, 'attachments'], queryFn: () => api<Attachment[]>('/orders/' + id + '/attachments'), enabled: !!id });

  const createPayment = useCreatePayment();
  const downloadDoc = useDownloadDocument();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [links, setLinks] = useState<{ tracking: string; telegram: string | null } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [statusChange, setStatusChange] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [photoKind, setPhotoKind] = useState('OTHER');
  // One idempotency key per payment attempt: retries of the same submit are deduplicated by the API.
  const paymentKey = useRef(newKey());
  const refundKey = useRef(newKey());

  const diagForm = useForm<DiagnosisInput>({ resolver: zodResolver(diagnosisSchema) });
  const payForm = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: { method: 'CASH' } });

  const mySession = order?.repairSessions.find(s => s.userId === me?.id && !s.endedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!mySession) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [mySession]);
  const workedSeconds = useMemo(() => (order?.repairSessions ?? []).reduce((sum, s) => {
    const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
    return sum + (end - new Date(s.startedAt).getTime()) / 1000;
  }, 0), [order?.repairSessions, now]);

  useEffect(() => {
    if (orderQuery.error?.message === 'SESSION_EXPIRED') router.replace('/login');
  }, [orderQuery.error, router]);
  useEffect(() => {
    // Set by the intake page when the order was saved but some photos did not upload.
    const failed = new URLSearchParams(window.location.search).get('photos');
    if (failed) setError(`Buyurtma saqlandi, lekin ${failed} ta rasm yuklanmadi. "Rasmlar" bo'limidan qayta yuklang.`);
  }, []);

  if (orderQuery.isLoading) return <AppShell><div className="p-16 text-center text-sm text-zinc-400">Buyurtma yuklanmoqda...</div></AppShell>;
  if (!order) return <AppShell><div className="p-16 text-center text-sm text-red-500">{orderQuery.error?.message === 'SESSION_EXPIRED' ? '' : 'Buyurtma topilmadi'}</div></AppShell>;

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['orders', id] }),
      qc.invalidateQueries({ queryKey: ['orders'], exact: true }),
      qc.invalidateQueries({ queryKey: ['parts'] }),
    ]);
  };
  async function run(path: string, body?: unknown, method = 'POST', done?: string) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setError("Internet aloqasi yo'q. Amal bajarilmadi."); return false; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/orders/' + id + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      await refresh();
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xatolik yuz berdi');
      return false;
    } finally { setBusy(false); }
  }

  const closed = CLOSED.includes(order.status);
  const approvedCurrent = order.approvalStatus === 'APPROVED' && order.approvedVersion === order.quoteVersion;
  const activeParts = order.parts.filter(p => p.status === 'RESERVED' || p.status === 'USED');
  const partsSum = activeParts.reduce((s, p) => s + Number(p.unitPrice) * p.quantity, 0);
  const usedParts = order.parts.filter(p => p.status === 'USED');
  const laborSum = order.repairActions.reduce((s, a) => s + Number(a.laborAmount), 0);
  const checklist = order.finalTestChecklist;
  const allChecked = checklist.every(c => checked.includes(c));
  const stepIdx = STEPS.indexOf(order.status);
  const name = (userId: string) => order.actorNames[userId] ?? (userId.startsWith('customer-link:') ? 'Mijoz (havola)' : 'Xodim');
  const paymentMethods: [string, string][] = [...BUILT_IN_METHODS, ...(methods.data ?? []).filter(m => !BUILT_IN_METHODS.some(([k]) => k === m.key)).map(m => [m.key, m.label] as [string, string])];
  const refundedOf = (paymentId: string) => order.payments.filter(p => p.kind === 'REFUND' && p.originalPaymentId === paymentId).reduce((s, p) => s + Number(p.amount), 0);

  async function openDocument(type: string) {
    try {
      const blob = await downloadDoc.mutateAsync({ orderId: id, type });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e instanceof Error ? e.message : 'Hujjat yaratilmadi'); }
  }
  async function openPhoto(attachmentId: string) {
    try {
      const { url } = await api<{ url: string }>('/orders/' + id + '/attachments/' + attachmentId + '/url');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e instanceof Error ? e.message : 'Rasm ochilmadi'); }
  }
  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) await uploadAttachment(id, file, photoKind);
      await qc.invalidateQueries({ queryKey: ['orders', id, 'attachments'] });
      setNotice('Rasm yuklandi');
    } catch (e) { setError(e instanceof Error ? e.message : 'Rasm yuklanmadi'); } finally { setBusy(false); }
  }
  async function submitPayment(data: PaymentInput) {
    setError(''); setNotice('');
    try {
      await createPayment.mutateAsync({ orderId: id, data: { amount: data.amount, method: data.method, idempotencyKey: paymentKey.current } });
      paymentKey.current = newKey();
      payForm.reset({ method: data.method, amount: '' });
      await refresh();
      setNotice("To'lov qabul qilindi");
    } catch (e) { setError(e instanceof Error ? e.message : "To'lov saqlanmadi"); }
  }
  async function submitRefund(e: React.FormEvent<HTMLFormElement>, paymentId: string) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await api('/payments/' + paymentId + '/refund', { method: 'POST', body: JSON.stringify({ amount: String(d.get('amount')), reason: String(d.get('reason')), idempotencyKey: refundKey.current }) });
      refundKey.current = newKey();
      setRefundFor(null);
      await refresh();
      setNotice('Qaytarish (refund) saqlandi');
    } catch (err) { setError(err instanceof Error ? err.message : 'Refund saqlanmadi'); } finally { setBusy(false); }
  }

  return (
    <AppShell
      subtitle={order.device.brand + ' ' + order.device.model}
      title={order.number}
      action={
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status} className="text-xs" />
          <Link href="/orders"><Button variant="outline" size="sm" className="gap-1.5 text-xs"><ArrowLeft className="h-3.5 w-3.5" />Ro&apos;yxat</Button></Link>
        </div>
      }
    >
      <div className="space-y-6">
        {error && (
          <div role="alert" className="p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-sm rounded-xl border border-red-200 dark:border-red-900 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span>
            <button onClick={() => setError('')} className="font-bold" aria-label="Yopish">×</button>
          </div>
        )}
        {notice && !error && (
          <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-sm rounded-xl border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{notice}</span>
            <button onClick={() => setNotice('')} className="font-bold" aria-label="Yopish">×</button>
          </div>
        )}

        {/* Progress */}
        <Card>
          <CardContent className="p-4 sm:p-6 overflow-x-auto">
            {closed && order.status !== 'DELIVERED' ? (
              <p className="text-sm font-semibold text-red-600">{STEP_LABEL[order.status]}</p>
            ) : (
              <div className="flex items-center min-w-[620px]">
                {STEPS.map((st, idx) => (
                  <React.Fragment key={st}>
                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${order.status === st ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 ring-4 ring-zinc-200 dark:ring-zinc-800' : stepIdx > idx ? 'bg-emerald-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                        {stepIdx > idx ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                      </div>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${order.status === st ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400'}`}>{STEP_LABEL[st]}</span>
                    </div>
                    {idx < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${stepIdx > idx ? 'bg-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800'}`} />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4 text-zinc-500" />{order.device.brand} {order.device.model}</CardTitle>
                <CardDescription>
                  {order.device.imei ? 'IMEI: ' + order.device.imei : 'IMEI kiritilmagan'}
                  {order.device.serialNumber ? ' · S/N: ' + order.device.serialNumber : ''}
                  {order.device.color ? ' · ' + order.device.color : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <Link href={'/customers/' + order.customer.id} className="block p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800 hover:border-zinc-300">
                  <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Mijoz</span>
                  <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{order.customer.firstName} {order.customer.lastName}</p>
                  <p className="text-zinc-500">{order.customer.phone} · Telegram {order.customer.telegramChatId ? '🟢 ulangan' : '⚪ ulanmagan'}</p>
                </Link>
                <div className="space-y-1">
                  <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Mijoz shikoyati</span>
                  <p className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{order.complaint}</p>
                </div>
                {order.accessories.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Komplektatsiya</span>
                    <div className="flex flex-wrap gap-1">{order.accessories.map(a => <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>)}</div>
                  </div>
                )}
                {order.condition.length > 0 && (
                  <div className="space-y-1">
                    <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[10px]">Tashqi holat</span>
                    <div className="flex flex-wrap gap-1">{order.condition.map(a => <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>)}</div>
                  </div>
                )}
                <p className="text-zinc-400">Qabul: {dateTime(order.createdAt)}</p>
                {can('orders.edit') && (
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                    <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" disabled={busy} onClick={async () => {
                      setBusy(true); setError('');
                      try { setLinks(await api('/orders/' + id + '/links', { method: 'POST' })); } catch (e) { setError(e instanceof Error ? e.message : 'Havola yaratilmadi'); } finally { setBusy(false); }
                    }}><LinkIcon className="h-3.5 w-3.5" />Mijoz uchun havolalar</Button>
                    {links && (
                      <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg space-y-1">
                        <a href={links.tracking} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline block break-all">🔗 Holatni kuzatish</a>
                        {links.telegram && <a href={links.telegram} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline block break-all">✈️ Telegram botni ulash</a>}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4 text-zinc-500" />Hujjatlar</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {[['receipt', '📄 Kvitansiya'], ['repair', "🔧 Ta'mir cheki"], ['payment', "💳 To'lov cheki"], ['warranty', '🛡 Kafolat taloni']].map(([type, label]) => (
                  <Button key={type} variant="outline" size="sm" className="text-xs" disabled={downloadDoc.isPending || (type === 'warranty' && !order.warranty)} onClick={() => openDocument(type as string)}>{label}</Button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4 text-zinc-500" />Rasmlar</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs">
                {(attachments.data ?? []).length === 0 && <p className="text-zinc-400">Rasm yuklanmagan</p>}
                <div className="grid grid-cols-2 gap-2">
                  {(attachments.data ?? []).map(a => (
                    <button key={a.id} onClick={() => openPhoto(a.id)} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      <span className="font-semibold block">{PHOTO_KINDS.find(([k]) => k === a.kind)?.[1] ?? a.kind}</span>
                      <span className="text-zinc-400">{Math.round(a.size / 1024)} KB · ko&apos;rish</span>
                    </button>
                  ))}
                </div>
                {can('orders.edit') && !closed && (
                  <div className="flex gap-2 items-center">
                    <Select value={photoKind} onChange={e => setPhotoKind(e.target.value)} className="h-9 text-xs" aria-label="Rasm turi">
                      {PHOTO_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                    <label className="shrink-0 cursor-pointer rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 h-9 flex items-center font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900">
                      + Rasm
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={busy} onChange={e => { void addPhotos(e.target.files); e.target.value = ''; }} />
                    </label>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4 text-zinc-500" />Holatlar tarixi</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-3 text-xs">
                  {order.history.map(h => (
                    <li key={h.id} className="border-l-2 border-zinc-200 dark:border-zinc-800 pl-3">
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{h.fromStatus ? STEP_LABEL[h.fromStatus] + ' → ' : ''}{STEP_LABEL[h.toStatus] ?? h.toStatus}</p>
                      <p className="text-zinc-500">{dateTime(h.createdAt)} · {name(h.actorId)}</p>
                      {h.comment && <p className="text-zinc-600 dark:text-zinc-400">{h.comment}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-2 space-y-6">
            {/* Assignments */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4 text-zinc-500" />Ustalar</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {order.assignments.length === 0 ? <p className="text-xs text-amber-600">Hali usta biriktirilmagan</p> : (
                  <ul className="space-y-1.5">
                    {order.assignments.map(a => (
                      <li key={a.userId} className="flex justify-between gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                        <span className="font-semibold">{a.user.firstName} {a.user.lastName}</span>
                        <span className="text-zinc-500 text-xs text-right">{a.task}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {can('orders.assign') && !closed && (
                  <form className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2" onSubmit={async e => {
                    e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
                    if (await run('/assign', { userId: d.get('userId'), task: d.get('task') }, 'POST', 'Usta biriktirildi')) f.reset();
                  }}>
                    <Select name="userId" required aria-label="Usta" defaultValue="">
                      <option value="" disabled>Ustani tanlang</option>
                      {(technicians.data ?? []).map(t => <option key={t.id} value={t.id}>{t.firstName}</option>)}
                    </Select>
                    <Input name="task" required minLength={1} maxLength={500} placeholder="Vazifa: diagnostika, displey almashtirish..." />
                    <Button type="submit" disabled={busy} size="sm" className="h-10">Biriktirish</Button>
                  </form>
                )}
                {can('orders.assign') && !closed && technicians.data?.length === 0 && <p className="text-xs text-zinc-400">Bu filialda faol usta yo&apos;q. Xodimlar bo&apos;limida TECHNICIAN rolida xodim qo&apos;shing.</p>}
              </CardContent>
            </Card>

            {/* Start diagnosis */}
            {order.status === 'RECEIVED' && can('orders.change_status') && (
              <Card className="border-blue-200 dark:border-blue-900">
                <CardHeader>
                  <CardTitle className="text-base">Qurilma qabul qilingan</CardTitle>
                  <CardDescription>Diagnostikani boshlang.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button disabled={busy} className="gap-2" onClick={() => run('/status', { status: 'DIAGNOSING', comment: 'Diagnostika boshlandi' }, 'PATCH')}><Wrench className="h-4 w-4" />Diagnostikani boshlash</Button>
                </CardContent>
              </Card>
            )}

            {/* Diagnosis & quote */}
            {['DIAGNOSING', 'WAITING_CUSTOMER_APPROVAL'].includes(order.status) && can('diagnostics.create') && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{order.quoteVersion > 0 ? 'Smetani yangilash' : 'Diagnostika va smeta'}</CardTitle>
                  <CardDescription>Smeta saqlangach mijozga tasdiqlash uchun yuboriladi. Yangilansa, eski tasdiq bekor bo&apos;ladi.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={diagForm.handleSubmit(async data => {
                    if (await run('/diagnosis', { diagnosis: data.diagnosis, requiredWork: data.requiredWork, labor: data.labor, partsTotal: data.partsTotal, ...(data.estimatedTime ? { estimatedTime: data.estimatedTime } : {}) }, 'POST', 'Smeta saqlandi va tasdiqqa yuborildi')) diagForm.reset();
                  })} className="space-y-4">
                    <FormField label="Diagnostika xulosasi" error={diagForm.formState.errors.diagnosis?.message} required>
                      <Textarea {...diagForm.register('diagnosis')} defaultValue={order.diagnosis ?? ''} placeholder="OLED panel shikastlangan" />
                    </FormField>
                    <FormField label="Bajariladigan ish" error={diagForm.formState.errors.requiredWork?.message} required>
                      <Input {...diagForm.register('requiredWork')} defaultValue={order.requiredWork ?? ''} placeholder="Displey almashtirish" />
                    </FormField>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <FormField label="Ish haqi (so'm)" error={diagForm.formState.errors.labor?.message} required>
                        <Input {...diagForm.register('labor')} inputMode="decimal" placeholder="150000" />
                      </FormField>
                      <FormField label="Ehtiyot qism (so'm)" error={diagForm.formState.errors.partsTotal?.message} required>
                        <Input {...diagForm.register('partsTotal')} inputMode="decimal" placeholder="700000" />
                      </FormField>
                      <FormField label="Taxminiy muddat" error={diagForm.formState.errors.estimatedTime?.message}>
                        <Input {...diagForm.register('estimatedTime')} defaultValue={order.estimatedTime ?? ''} placeholder="1 kun" />
                      </FormField>
                    </div>
                    <div className="flex justify-end"><Button type="submit" disabled={busy} className="gap-2"><Send className="h-4 w-4" />Smetani saqlash</Button></div>
                  </form>
                </CardContent>
              </Card>
            )}

            {order.quoteVersion > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Smeta v{order.quoteVersion}</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p><span className="text-zinc-500">Diagnostika:</span> {order.diagnosis}</p>
                  <p><span className="text-zinc-500">Ish:</span> {order.requiredWork}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Ish haqi</span><b>{money(order.labor)}</b></div>
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Detal</span><b>{money(order.partsTotal)}</b></div>
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Jami</span><b>{money(order.total)}</b></div>
                    <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Muddat</span><b>{order.estimatedTime || '—'}</b></div>
                  </div>
                  <p className="text-xs">Mijoz tasdig&apos;i: {approvedCurrent ? <b className="text-emerald-600">✓ Tasdiqlangan ({order.approvalChannel === 'CUSTOMER_LINK' ? 'mijoz havolasi' : 'xodim qayd etdi'})</b> : order.approvalStatus === 'REJECTED' ? <b className="text-red-600">✕ Rad etilgan</b> : <b className="text-amber-600">Kutilmoqda</b>}</p>
                </CardContent>
              </Card>
            )}

            {order.status === 'WAITING_CUSTOMER_APPROVAL' && can('orders.edit') && (
              <Card className="border-amber-200 dark:border-amber-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-5 w-5 text-amber-500" />Mijoz qarorini qayd etish</CardTitle>
                  <CardDescription>Mijoz Telegram/SMS havolasi orqali o&apos;zi tasdiqlashi mumkin. Telefonda kelishilgan bo&apos;lsa, shu yerda qayd eting.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2" onSubmit={e => {
                    e.preventDefault(); const d = new FormData(e.currentTarget);
                    void run('/approve', { quoteVersion: order.quoteVersion, approved: d.get('approved') === 'yes', evidence: String(d.get('evidence')) }, 'POST', 'Mijoz qarori saqlandi');
                  }}>
                    <Select name="approved" aria-label="Qaror"><option value="yes">✓ Tasdiqladi</option><option value="no">✕ Rad etdi</option></Select>
                    <Input name="evidence" required minLength={3} placeholder="Telefon orqali tasdiqlandi, 14:20" />
                    <Button type="submit" disabled={busy} size="sm" className="h-10">Saqlash</Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Repair workspace */}
            {['WAITING_PART', 'IN_REPAIR'].includes(order.status) && (
              <>
                <Card className="bg-zinc-900 text-white border-zinc-800">
                  <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center text-emerald-400"><Clock className="h-6 w-6" /></div>
                      <div>
                        <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-400">Ta&apos;mir vaqti (jami)</span>
                        <div className="text-2xl font-bold font-mono">{duration(workedSeconds)}</div>
                        <span className="text-[11px] text-zinc-400">{mySession ? '● Siz hozir ishlayapsiz' : order.repairSessions.some(s => !s.endedAt) ? '● Boshqa usta ishlayapti' : 'Ish to‘xtatilgan'}</span>
                      </div>
                    </div>
                    {can('orders.change_status') && approvedCurrent && (
                      mySession
                        ? <Button size="sm" variant="secondary" disabled={busy} className="gap-1.5" onClick={() => run('/repair/pause', undefined, 'POST', 'Ish to‘xtatildi')}><Pause className="h-4 w-4" />Tanaffus</Button>
                        : <Button size="sm" disabled={busy} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => run('/repair/start', undefined, 'POST', 'Ish boshlandi')}><Play className="h-4 w-4" />Ishni boshlash</Button>
                    )}
                  </CardContent>
                </Card>

                {/* Parts */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><PackagePlus className="h-4 w-4 text-zinc-500" />Ehtiyot qismlar</CardTitle>
                    <CardDescription>Smeta: {money(order.partsTotal)} · Band qilingan: {money(partsSum)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {order.parts.length === 0 && <p className="text-xs text-zinc-400">Detal biriktirilmagan</p>}
                    {order.parts.map(p => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800">
                        <div>
                          <p className="font-semibold">{p.part.name} <span className="text-zinc-400 font-normal">· {p.part.sku}</span></p>
                          <p className="text-xs text-zinc-500">{p.quantity} × {money(p.unitPrice)} · {PART_STATUS[p.status] ?? p.status}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {p.status === 'RESERVED' && order.status === 'IN_REPAIR' && can('inventory.use') && <Button size="sm" disabled={busy} onClick={() => run('/parts/' + p.partId + '/use', undefined, 'POST', "Detal o'rnatildi, ombordan chiqarildi")}>O&apos;rnatildi</Button>}
                          {p.status === 'RESERVED' && can('inventory.use') && <Button size="sm" variant="outline" disabled={busy} onClick={() => run('/parts/' + p.partId + '/release', undefined, 'POST', 'Rezerv bekor qilindi')}>Rezervni bekor qilish</Button>}
                          {p.status === 'USED' && can('inventory.manage') && <Button size="sm" variant="outline" disabled={busy} className="gap-1" onClick={() => { if (window.confirm("Detal qurilmadan olinib, omborga qaytarilsinmi?")) void run('/parts/' + p.partId + '/return', undefined, 'POST', 'Detal omborga qaytarildi'); }}><Undo2 className="h-3.5 w-3.5" />Omborga qaytarish</Button>}
                        </div>
                      </div>
                    ))}
                    {can('inventory.use') && approvedCurrent && (
                      inventory.isError ? <p className="text-xs text-zinc-400">Ombor moduli tarifingizda yoqilmagan yoki ruxsat yo&apos;q.</p> : (
                        <form className="grid grid-cols-1 sm:grid-cols-[1fr_90px_auto] gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800" onSubmit={async e => {
                          e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
                          if (await run('/parts', { partId: d.get('partId'), quantity: Number(d.get('quantity')) }, 'POST', 'Detal rezerv qilindi')) f.reset();
                        }}>
                          <Select name="partId" required defaultValue="" aria-label="Detal">
                            <option value="" disabled>Detalni tanlang</option>
                            {(inventory.data ?? []).map(p => {
                              const s = p.stocks.find(x => x.branchId === order.branchId);
                              const free = s ? s.onHand - s.reserved : 0;
                              return <option key={p.id} value={p.id} disabled={free <= 0}>{p.name} ({p.sku}) — {money(p.salePrice)} · bo&apos;sh: {free}</option>;
                            })}
                          </Select>
                          <Input name="quantity" type="number" min={1} defaultValue={1} required aria-label="Soni" />
                          <Button type="submit" size="sm" className="h-10" disabled={busy}>Rezerv</Button>
                        </form>
                      )
                    )}
                  </CardContent>
                </Card>

                {/* Repair actions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2"><Hammer className="h-4 w-4 text-zinc-500" />Bajarilgan ishlar</CardTitle>
                    <CardDescription>Tasdiqlangan ish haqi: {money(order.labor)} · Kiritilgan: {money(laborSum)}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {order.repairActions.map(a => (
                      <div key={a.id} className="flex justify-between gap-3 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                        <span>{a.description} <span className="text-xs text-zinc-400">· {name(a.userId)}</span></span>
                        <b className="shrink-0">{money(a.laborAmount)}</b>
                      </div>
                    ))}
                    {order.status === 'IN_REPAIR' && can('orders.change_status') && (
                      <form className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2" onSubmit={async e => {
                        e.preventDefault(); const f = e.currentTarget; const d = new FormData(f);
                        const userId = d.get('userId');
                        if (await run('/repair/actions', { description: d.get('description'), laborAmount: d.get('laborAmount'), ...(userId ? { userId } : {}) }, 'POST', 'Ish qayd etildi')) f.reset();
                      }}>
                        <Input name="description" required minLength={3} placeholder="Displey almashtirildi" />
                        <Input name="laborAmount" required pattern="\d{1,12}(\.\d{1,2})?" inputMode="decimal" placeholder="150000" aria-label="Ish haqi" />
                        <Button type="submit" size="sm" className="h-10" disabled={busy}>Qo&apos;shish</Button>
                        {can('orders.assign') && order.assignments.length > 1 && (
                          <Select name="userId" defaultValue="" className="sm:col-span-3" aria-label="Bajargan usta">
                            <option value="">Bajargan: men</option>
                            {order.assignments.map(a => <option key={a.userId} value={a.userId}>Bajargan: {a.user.firstName}</option>)}
                          </Select>
                        )}
                      </form>
                    )}
                  </CardContent>
                </Card>

                {/* Final test */}
                {order.status === 'IN_REPAIR' && can('orders.change_status') && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2"><CheckSquare className="h-4 w-4 text-emerald-500" />Yakuniy test</CardTitle>
                      <CardDescription>Hamma punktlar tekshirilgach ta&apos;mir yakunlanadi va mijozga &quot;Tayyor&quot; xabari ketadi.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {checklist.map(item => {
                          const on = checked.includes(item);
                          return (
                            <button key={item} type="button" onClick={() => setChecked(prev => on ? prev.filter(x => x !== item) : [...prev, item])}
                              className={`p-3 rounded-lg text-xs font-semibold border text-left flex items-center justify-between ${on ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>
                              <span>{item}</span>{on && <CheckCircle2 className="h-4 w-4" />}
                            </button>
                          );
                        })}
                      </div>
                      {order.parts.some(p => p.status === 'RESERVED') && <p className="text-xs text-amber-600">Rezervdagi detallarni &quot;O&apos;rnatildi&quot; yoki &quot;Rezervni bekor qilish&quot; qiling.</p>}
                      <div className="flex justify-between items-center pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <Button type="button" variant="outline" size="sm" onClick={() => setChecked(checklist)}>Hammasini belgilash</Button>
                        <Button disabled={busy || !allChecked} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => run('/repair/finish', { passedChecks: checked }, 'POST', "Ta'mir yakunlandi — buyurtma tayyor")}>
                          <CheckCircle2 className="h-4 w-4" />Ta&apos;mir tugadi
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {/* Delivery */}
            {order.status === 'READY' && can('orders.edit') && (
              <Card className="border-emerald-200 dark:border-emerald-900">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" />Mijozga topshirish va kafolat</CardTitle>
                  <CardDescription>{Number(order.balance) > 0 ? `Qoldiq qarz: ${money(order.balance)}` : "To'lov to'liq"}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={e => {
                    e.preventDefault(); const d = new FormData(e.currentTarget);
                    void run('/deliver', {
                      warrantyDays: Number(d.get('days')), warrantyTerms: String(d.get('terms')), allowDebt: d.get('allowDebt') === 'on',
                      coveredOrderPartIds: d.getAll('coverPart').map(String), coveredRepairActionIds: d.getAll('coverAction').map(String),
                    }, 'POST', 'Qurilma topshirildi, kafolat yaratildi');
                  }}>
                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
                      <FormField label="Kafolat (kun)"><Input name="days" type="number" min={1} max={1095} defaultValue={90} required /></FormField>
                      <FormField label="Kafolat shartlari"><Input key={defaults.data?.warrantyTerms ?? ''} name="terms" required minLength={5} maxLength={4000} defaultValue={defaults.data?.warrantyTerms || 'Almashtirilgan detal va bajarilgan ish uchun kafolat'} /></FormField>
                    </div>
                    {(usedParts.length > 0 || order.repairActions.length > 0) && (
                      <fieldset className="space-y-1.5 text-xs">
                        <legend className="font-semibold mb-1">Kafolat nimani qamraydi</legend>
                        {usedParts.map(p => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="coverPart" value={p.id} defaultChecked className="h-4 w-4" />{p.part.name}</label>)}
                        {order.repairActions.map(a => <label key={a.id} className="flex items-center gap-2"><input type="checkbox" name="coverAction" value={a.id} defaultChecked className="h-4 w-4" />{a.description}</label>)}
                      </fieldset>
                    )}
                    {Number(order.balance) > 0 && can('payments.deliver_with_debt') && (
                      <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" name="allowDebt" className="h-4 w-4" />Qarz bilan topshirishga ruxsat beraman</label>
                    )}
                    <Button type="submit" disabled={busy || (Number(order.balance) > 0 && !can('payments.deliver_with_debt'))} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"><CheckCircle2 className="h-4 w-4" />Topshirish</Button>
                    {Number(order.balance) > 0 && !can('payments.deliver_with_debt') && <p className="text-xs text-red-600">Avval to&apos;lovni to&apos;liq qabul qiling.</p>}
                  </form>
                </CardContent>
              </Card>
            )}

            {order.warranty && (
              <Card>
                <CardContent className="p-4 text-sm flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-semibold">Kafolat: {new Date(order.warranty.endDate).toLocaleDateString('ru-RU')} gacha{new Date(order.warranty.endDate) > new Date() ? ` · ${Math.ceil((new Date(order.warranty.endDate).getTime() - Date.now()) / 86400000)} kun qoldi` : ' · muddati tugagan'}</p>
                    <p className="text-xs text-zinc-500">{order.warranty.terms}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Payments */}
            {can('payments.view') && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-zinc-500" />To&apos;lovlar</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Jami</span><b className="text-sm">{money(order.total)}</b></div>
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">To&apos;langan</span><b className="text-sm">{money(order.totalPaid)}</b></div>
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900"><span className="text-zinc-400 block">Qoldiq</span><b className={`text-sm ${Number(order.balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{money(order.balance)}</b></div>
                  </div>
                  {order.payments.length > 0 && (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {order.payments.map(p => (
                        <li key={p.id} className="py-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-500">{dateTime(p.createdAt)} · {paymentMethods.find(([k]) => k === p.method)?.[1] ?? p.method}{p.reason ? ' · ' + p.reason : ''}</span>
                            <span className="flex items-center gap-2">
                              <b className={p.kind === 'REFUND' ? 'text-red-600' : 'text-emerald-700'}>{p.kind === 'REFUND' ? '−' : '+'}{money(p.amount)}</b>
                              {p.kind === 'PAYMENT' && can('payments.refund') && refundedOf(p.id) < Number(p.amount) && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRefundFor(refundFor === p.id ? null : p.id)}>Qaytarish</Button>
                              )}
                            </span>
                          </div>
                          {refundFor === p.id && (
                            <form className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2" onSubmit={e => submitRefund(e, p.id)}>
                              <Input name="amount" required pattern="\d{1,12}(\.\d{1,2})?" defaultValue={String(Number(p.amount) - refundedOf(p.id))} aria-label="Qaytariladigan summa" />
                              <Input name="reason" required minLength={3} placeholder="Qaytarish sababi" />
                              <Button type="submit" size="sm" variant="destructive" className="h-10" disabled={busy}>Tasdiqlash</Button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {can('payments.create') && !closed && Number(order.balance) > 0 && (
                    <form onSubmit={payForm.handleSubmit(submitPayment)} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <FormField label="Summa" error={payForm.formState.errors.amount?.message} required>
                        <Input {...payForm.register('amount')} inputMode="decimal" placeholder={String(Number(order.balance))} />
                      </FormField>
                      <FormField label="Usul" error={payForm.formState.errors.method?.message}>
                        <Select {...payForm.register('method')}>{paymentMethods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                      </FormField>
                      <Button type="submit" disabled={createPayment.isPending} className="self-end h-10" size="sm">{createPayment.isPending ? 'Saqlanmoqda...' : 'Qabul qilish'}</Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Cancel / unrepairable / back to waiting part */}
            {can('orders.change_status') && (MANUAL_TRANSITIONS[order.status]?.length ?? 0) > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {MANUAL_TRANSITIONS[order.status]!.map(st => (
                      <Button key={st} size="sm" variant={st === 'WAITING_PART' ? 'outline' : 'destructive'} className="gap-1.5" onClick={() => setStatusChange(statusChange === st ? null : st)}>
                        {st === 'WAITING_PART' ? <Clock className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {st === 'WAITING_PART' ? 'Detal kutish' : st === 'CANCELLED' ? 'Bekor qilish' : "Tuzatib bo'lmaydi"}
                      </Button>
                    ))}
                  </div>
                  {statusChange && (
                    <form className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2" onSubmit={async e => {
                      e.preventDefault(); const d = new FormData(e.currentTarget);
                      if (await run('/status', { status: statusChange, comment: String(d.get('comment')) }, 'PATCH', 'Holat o‘zgartirildi')) setStatusChange(null);
                    }}>
                      <Input name="comment" required minLength={1} maxLength={1000} placeholder="Sabab (majburiy)" />
                      <Button type="submit" size="sm" className="h-10" disabled={busy}>Tasdiqlash: {STEP_LABEL[statusChange]}</Button>
                    </form>
                  )}
                  {statusChange && statusChange !== 'WAITING_PART' && order.parts.some(p => p.status === 'USED') && (
                    <p className="text-xs text-amber-600">O&apos;rnatilgan detallarni avval &quot;Omborga qaytarish&quot; qiling.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
