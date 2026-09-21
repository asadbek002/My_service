'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useOrder, useMe, useParts, useStaff, useCreatePayment, useUpdateOrderStatus, useDownloadDocument } from '../../../lib/queries';
import { diagnosisSchema, paymentSchema, type DiagnosisInput, type PaymentInput } from '../../../lib/schemas';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Select } from '../../../components/ui/select';
import { Textarea } from '../../../components/ui/textarea';
import { FormField } from '../../../components/ui/form-field';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { api, apiBlob, uploadAttachment } from '../../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: order, isLoading, error: orderError } = useOrder(id);
  const { data: me } = useMe();
  const { data: parts = [] } = useParts();
  const { data: staffList = [] } = useStaff();
  const createPayment = useCreatePayment();
  const updateStatus = useUpdateOrderStatus();
  const downloadDoc = useDownloadDocument();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [links, setLinks] = useState<{ tracking: string; telegram: string | null } | null>(null);
  const [payments, setPayments] = useState<{ id: string; kind: string; amount: string; method: string }[]>([]);
  const [balance, setBalance] = useState('');
  const [paymentKey] = useState(() => crypto.randomUUID());

  const can = (p: string) => me?.permissions.includes(p) ?? false;

  const diagForm = useForm<DiagnosisInput>({ resolver: zodResolver(diagnosisSchema) });
  const payForm = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: { method: 'CASH' } });

  if (orderError?.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }
  if (isLoading) return <main className="page"><p className="muted">Yuklanmoqda...</p></main>;
  if (!order) return <main className="page"><p className="error">{error || 'Buyurtma topilmadi'}</p></main>;

  async function action(endpoint: string, body?: unknown, method = 'POST') {
    if (!navigator.onLine) { setError("Internet yo'q."); return; }
    setBusy(true); setError('');
    try {
      await api('/orders/' + id + endpoint, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      qc.invalidateQueries({ queryKey: ['orders', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Xato'); }
    finally { setBusy(false); }
  }

  async function openDoc(type: string) {
    try {
      const blob = await downloadDoc.mutateAsync({ orderId: id, type });
      window.open(URL.createObjectURL(blob), '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e instanceof Error ? e.message : 'Xato'); }
  }

  async function onDiagnosis(data: DiagnosisInput) {
    await action('/diagnosis', { diagnosis: data.diagnosis, requiredWork: data.requiredWork, labor: data.laborAmount, partsTotal: data.partsAmount });
    diagForm.reset();
  }

  async function onPayment(data: PaymentInput) {
    try {
      await createPayment.mutateAsync({ orderId: id, data: { ...data, idempotencyKey: paymentKey } });
      payForm.reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Xato'); }
  }

  return (
    <main className="page">
      <header><Link href="/orders">← Buyurtmalar</Link><span className="brand">MY SERVICE</span></header>

      <div className="title-row">
        <div><p className="eyebrow">BUYURTMA</p><h1>{order.number}</h1></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <StatusBadge status={order.status} />
          <strong>{Number(order.total).toLocaleString('uz-UZ')} so'm</strong>
        </div>
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {/* Hujjatlar */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader><CardTitle>Hujjatlar</CardTitle></CardHeader>
        <CardContent>
          <div className="actions">
            {['receipt', 'repair', 'payment', 'warranty'].map(type => (
              <Button key={type} variant="secondary" size="sm" onClick={() => openDoc(type)} disabled={downloadDoc.isPending}>
                {type}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="detail-grid">
        {/* Asosiy ma'lumotlar */}
        <Card>
          <CardHeader><CardTitle>{order.device.brand} {order.device.model}</CardTitle></CardHeader>
          <CardContent>
            <p>{order.customer.firstName} · {order.customer.phone}</p>
            <p className="muted" style={{ marginTop: 8 }}>{order.complaint}</p>
            {order.diagnosis && (
              <div style={{ marginTop: 16, padding: 12, background: '#f9f9f7', borderRadius: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Diagnostika</p>
                <p style={{ fontSize: 13 }}>{order.diagnosis}</p>
                <p style={{ fontSize: 13, color: '#555' }}>{order.requiredWork}</p>
              </div>
            )}

            {/* Havolalar */}
            {can('orders.edit') && (
              <div style={{ marginTop: 16 }}>
                <Button variant="secondary" size="sm" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { setLinks(await api('/orders/' + id + '/links', { method: 'POST' })); }
                  catch (e) { setError(e instanceof Error ? e.message : 'Xato'); }
                  finally { setBusy(false); }
                }}>Mijoz uchun havolalar</Button>
                {links && (
                  <div style={{ marginTop: 8, fontSize: 13, display: 'grid', gap: 4 }}>
                    <a href={links.tracking} target="_blank" rel="noreferrer">🔗 Kuzatish havolasi</a>
                    {links.telegram && <a href={links.telegram} target="_blank" rel="noreferrer">✈️ Telegram ulash</a>}
                  </div>
                )}
              </div>
            )}

            {/* Rasm yuklash */}
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Rasm qo'shish</p>
              <input type="file" accept="image/jpeg,image/png,image/webp"
                onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setBusy(true);
                  try { await uploadAttachment(id, file, 'DAMAGE'); qc.invalidateQueries({ queryKey: ['orders', id] }); }
                  catch (e) { setError(e instanceof Error ? e.message : 'Xato'); }
                  finally { setBusy(false); }
                }} />
            </div>

            {/* Amallar */}
            <div className="actions" style={{ marginTop: 16 }}>
              {order.status === 'RECEIVED' && can('orders.change_status') && (
                <Button disabled={busy} onClick={() => action('/status', { status: 'DIAGNOSING', comment: 'Diagnostika boshlandi' }, 'PATCH')}>
                  Diagnostikani boshlash
                </Button>
              )}
              {['WAITING_PART', 'IN_REPAIR'].includes(order.status) && can('orders.change_status') && (
                <>
                  <Button disabled={busy} onClick={() => action('/repair/start')}>Ishni boshlash</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => action('/repair/pause')}>Tanaffus</Button>
                </>
              )}
            </div>

            {/* Usta biriktirish */}
            {can('orders.assign') && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ustaga biriktirish</p>
                <form className="grid gap-3" onSubmit={e => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  action('/assign', { userId: d.get('userId'), task: d.get('task') });
                }}>
                  <Select name="userId" required>
                    <option value="">Usta tanlang</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.firstName}</option>)}
                  </Select>
                  <Input name="task" placeholder="Vazifa tavsifi" required />
                  <Button type="submit" size="sm" disabled={busy}>Biriktirish</Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Holat tarixi */}
        <Card>
          <CardHeader><CardTitle>Holat tarixi</CardTitle></CardHeader>
          <CardContent>
            <ol className="timeline">
              {(order.assignments ?? []).length > 0 && (
                <li>
                  <strong>Ustalar:</strong>
                  {order.assignments?.map(a => <p key={a.userId} style={{ fontSize: 13 }}>{a.user.firstName}{a.task ? ` — ${a.task}` : ''}</p>)}
                </li>
              )}
            </ol>
          </CardContent>
        </Card>

        {/* Diagnostika */}
        {['DIAGNOSING', 'WAITING_CUSTOMER_APPROVAL'].includes(order.status) && can('diagnostics.create') && (
          <Card>
            <CardHeader><CardTitle>Diagnostika va narx</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={diagForm.handleSubmit(onDiagnosis)} className="grid gap-3">
                <FormField label="Diagnostika" error={diagForm.formState.errors.diagnosis?.message} required>
                  <Textarea {...diagForm.register('diagnosis')} />
                </FormField>
                <FormField label="Bajariladigan ish" error={diagForm.formState.errors.requiredWork?.message} required>
                  <Textarea {...diagForm.register('requiredWork')} />
                </FormField>
                <FormField label="Ish haqi (so'm)" error={diagForm.formState.errors.laborAmount?.message} required>
                  <Input {...diagForm.register('laborAmount')} placeholder="150000" />
                </FormField>
                <FormField label="Detallar (so'm)" error={diagForm.formState.errors.partsAmount?.message} required>
                  <Input {...diagForm.register('partsAmount')} placeholder="700000" />
                </FormField>
                {diagForm.formState.errors.root && <p className="error">{diagForm.formState.errors.root.message}</p>}
                <Button type="submit" disabled={diagForm.formState.isSubmitting}>Tasdiqqa yuborish</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Mijoz qarori */}
        {order.status === 'WAITING_CUSTOMER_APPROVAL' && can('orders.edit') && (
          <Card>
            <CardHeader><CardTitle>Mijoz qarori</CardTitle></CardHeader>
            <CardContent>
              <p className="muted" style={{ marginBottom: 12 }}>Narx taklifi: {order.quoteVersion}</p>
              <form className="grid gap-3" onSubmit={e => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                action('/approve', { quoteVersion: order.quoteVersion, approved: d.get('approved') === 'yes', evidence: d.get('evidence') });
              }}>
                <FormField label="Qaror">
                  <Select name="approved">
                    <option value="yes">Tasdiqladi</option>
                    <option value="no">Rad etdi</option>
                  </Select>
                </FormField>
                <FormField label="Izoh">
                  <Textarea name="evidence" required minLength={3} />
                </FormField>
                <Button type="submit" disabled={busy}>Qarorni saqlash</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Detallar */}
        {['WAITING_PART', 'IN_REPAIR'].includes(order.status) && can('inventory.use') && (
          <Card>
            <CardHeader><CardTitle>Buyurtma detallari</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={e => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                action('/parts', { partId: d.get('partId'), quantity: Number(d.get('quantity')) });
              }}>
                <FormField label="Detal">
                  <Select name="partId" required>
                    <option value="">Tanlang</option>
                    {parts.map(p => <option key={p.id} value={p.id}>{p.name} — {p.salePrice}</option>)}
                  </Select>
                </FormField>
                <FormField label="Soni">
                  <Input name="quantity" type="number" min="1" defaultValue="1" />
                </FormField>
                <Button type="submit" size="sm" disabled={busy}>Rezerv qilish</Button>
              </form>

              {order.status === 'IN_REPAIR' && (
                <form className="grid gap-3" style={{ marginTop: 16 }} onSubmit={e => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  action('/parts/' + d.get('partId') + '/use');
                }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>Detalni ishlatish</p>
                  <Select name="partId" required>
                    <option value="">Tanlang</option>
                    {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  <Button type="submit" size="sm" variant="secondary" disabled={busy}>Ishlatildi</Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Yakuniy tekshiruv */}
        {order.status === 'IN_REPAIR' && can('orders.change_status') && (
          <Card>
            <CardHeader><CardTitle>Yakuniy tekshiruv</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={e => {
                e.preventDefault();
                action('/repair/finish', { passedChecks: Array.from(new FormData(e.currentTarget).getAll('checks')) });
              }}>
                {['Display', 'Touch', 'Camera', 'Microphone', 'Speaker', 'Charging', 'Wi-Fi', 'Bluetooth', 'Face ID'].map(check => (
                  <label key={check} className="check">
                    <input type="checkbox" name="checks" value={check} required />
                    {check}
                  </label>
                ))}
                <Button type="submit" disabled={busy}>Ta'mir tugadi ✓</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* To'lovlar */}
        {can('payments.view') && (
          <Card>
            <CardHeader><CardTitle>To'lovlar</CardTitle></CardHeader>
            <CardContent>
              <p style={{ marginBottom: 12 }}>Qoldiq: <strong>{Number(balance || order.total).toLocaleString('uz-UZ')} so'm</strong></p>
              {payments.map(p => (
                <p key={p.id} style={{ fontSize: 13, color: '#555' }}>{p.kind} · {p.method} · {Number(p.amount).toLocaleString('uz-UZ')} so'm</p>
              ))}
              {can('payments.create') && !['DELIVERED', 'CANCELLED'].includes(order.status) && (
                <form onSubmit={payForm.handleSubmit(onPayment)} className="grid gap-3" style={{ marginTop: 16 }}>
                  <FormField label="Summa" error={payForm.formState.errors.amount?.message} required>
                    <Input {...payForm.register('amount')} placeholder="500000" />
                  </FormField>
                  <FormField label="To'lov usuli" error={payForm.formState.errors.method?.message}>
                    <Select {...payForm.register('method')}>
                      {['CASH', 'CARD', 'CLICK', 'PAYME', 'TRANSFER', 'OTHER'].map(m => <option key={m} value={m}>{m}</option>)}
                    </Select>
                  </FormField>
                  {createPayment.error && <p className="error">{createPayment.error.message}</p>}
                  <Button type="submit" disabled={createPayment.isPending}>
                    {createPayment.isPending ? 'Qabul qilinmoqda...' : 'To\'lov qabul qilish'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        )}

        {/* Topshirish */}
        {order.status === 'READY' && can('orders.edit') && (
          <Card>
            <CardHeader><CardTitle>Mijozga topshirish</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={e => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                action('/deliver', {
                  warrantyDays: Number(d.get('days')),
                  warrantyTerms: d.get('terms'),
                  coveredOrderPartIds: d.getAll('coveredParts'),
                  coveredRepairActionIds: d.getAll('coveredActions'),
                  allowDebt: d.get('allowDebt') === 'on',
                });
              }}>
                <FormField label="Kafolat (kun)">
                  <Input name="days" type="number" min="1" max="1095" defaultValue="90" required />
                </FormField>
                <FormField label="Kafolat shartlari">
                  <Textarea name="terms" minLength={5} required />
                </FormField>
                {(order.assignments ?? []).length > 0 && <p className="muted" style={{ fontSize: 13 }}>Kafolat detallar va ishlar bo'yicha belgilang</p>}
                {can('payments.deliver_with_debt') && (
                  <label className="check">
                    <input type="checkbox" name="allowDebt" />
                    Qarzdorlik bilan topshirishga ruxsat
                  </label>
                )}
                <Button type="submit" disabled={busy}>Qurilmani topshirish</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
