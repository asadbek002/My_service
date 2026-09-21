'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrders, useCustomers, useBranches, useMe, useCreateCustomer, useCreateOrder } from '../../lib/queries';
import { customerSchema, deviceSchema, type CustomerInput, type DeviceInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

const receiveSchema = z.object({
  branchId: z.string().min(1, 'Filial tanlang'),
  complaint: z.string().min(3, 'Shikoyat majburiy'),
  accessories: z.string().optional(),
  condition: z.string().optional(),
});
type ReceiveInput = z.infer<typeof receiveSchema>;

export default function Orders() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, error: meError } = useMe();
  const { data: orders = [], isLoading } = useOrders();
  const { data: customers = [] } = useCustomers();
  const { data: branches = [] } = useBranches();
  const createCustomer = useCreateCustomer();
  const createOrder = useCreateOrder();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [showNew, setShowNew] = useState(false);

  const customerForm = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: { notificationPreference: 'AUTO' } });
  const deviceForm = useForm<DeviceInput>({ resolver: zodResolver(deviceSchema), defaultValues: { category: 'Telefon' } });
  const receiveForm = useForm<ReceiveInput>({ resolver: zodResolver(receiveSchema) });

  if (meError?.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }

  async function onCustomer(data: CustomerInput) {
    const c = await createCustomer.mutateAsync(data);
    setCustomerId(c.id);
    setStep(1);
    customerForm.reset();
  }

  async function onDevice(data: DeviceInput) {
    const d = await api<{ id: string }>('/devices', { method: 'POST', body: JSON.stringify({ customerId, ...data, compatibleModels: [] }) });
    setDeviceId(d.id);
    setStep(2);
    deviceForm.reset();
  }

  async function onReceive(data: ReceiveInput) {
    if (!navigator.onLine) { receiveForm.setError('root', { message: "Internet yo'q. Qabul saqlanmadi." }); return; }
    const order = await createOrder.mutateAsync({
      data: { customerId, deviceId, ...data, accessories: data.accessories?.split(',').map(s => s.trim()).filter(Boolean) ?? [], condition: data.condition?.split(',').map(s => s.trim()).filter(Boolean) ?? [] },
      photos,
    });
    setShowNew(false); setStep(0); setCustomerId(''); setDeviceId(''); setPhotos([]);
    router.push('/orders/' + order.id);
  }

  return (
    <main className="page">
      <header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/dashboard">Bosh sahifa</Link></header>
      <div className="title-row">
        <div><p className="eyebrow">SERVIS JARAYONI</p><h1>Buyurtmalar</h1></div>
        {me?.permissions.includes('orders.create') && (
          <Button onClick={() => { setShowNew(v => !v); setStep(0); setCustomerId(''); setDeviceId(''); }}>
            {showNew ? 'Yopish' : '+ Yangi qabul'}
          </Button>
        )}
      </div>

      {showNew && (
        <div className="intake-grid" style={{ marginBottom: 32 }}>
          {/* Step 1 — Mijoz */}
          <Card>
            <CardHeader><CardTitle>1. Mijoz</CardTitle></CardHeader>
            <CardContent>
              {customerId ? (
                <div>
                  <p className="success">✓ Mijoz tanlandi</p>
                  <Button variant="ghost" size="sm" onClick={() => { setCustomerId(''); setDeviceId(''); setStep(0); }}>O'zgartirish</Button>
                </div>
              ) : (
                <>
                  <FormField label="Mavjud mijoz">
                    <Select onChange={e => { if (e.target.value) { setCustomerId(e.target.value); setStep(1); } }}>
                      <option value="">Qidirish...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.firstName} — {c.phone}</option>)}
                    </Select>
                  </FormField>
                  <hr />
                  <p className="eyebrow" style={{ marginBottom: 12 }}>YANGI MIJOZ</p>
                  <form onSubmit={customerForm.handleSubmit(onCustomer)} className="grid gap-3">
                    <FormField label="Ism" error={customerForm.formState.errors.firstName?.message} required>
                      <Input {...customerForm.register('firstName')} placeholder="Aziz" />
                    </FormField>
                    <FormField label="Telefon" error={customerForm.formState.errors.phone?.message} required>
                      <Input {...customerForm.register('phone')} placeholder="+998901234567" />
                    </FormField>
                    <FormField label="Telegram">
                      <Input {...customerForm.register('telegramUsername')} placeholder="@username" />
                    </FormField>
                    <FormField label="Xabar kanali">
                      <Select {...customerForm.register('notificationPreference')}>
                        <option value="AUTO">Avtomatik</option>
                        <option value="TELEGRAM">Telegram</option>
                        <option value="SMS">SMS</option>
                      </Select>
                    </FormField>
                    {createCustomer.error && <p className="error">{createCustomer.error.message}</p>}
                    <Button type="submit" disabled={createCustomer.isPending}>
                      {createCustomer.isPending ? 'Saqlanmoqda...' : 'Mijoz yaratish'}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          {/* Step 2 — Qurilma */}
          <Card>
            <CardHeader><CardTitle>2. Qurilma</CardTitle></CardHeader>
            <CardContent>
              {!customerId ? <p className="muted">Avval mijoz tanlang</p> :
               deviceId ? (
                <div>
                  <p className="success">✓ Qurilma saqlandi</p>
                  <Button variant="ghost" size="sm" onClick={() => { setDeviceId(''); setStep(1); }}>O'zgartirish</Button>
                </div>
               ) : (
                <form onSubmit={deviceForm.handleSubmit(onDevice)} className="grid gap-3">
                  <FormField label="Kategoriya" error={deviceForm.formState.errors.category?.message} required>
                    <Input {...deviceForm.register('category')} placeholder="Telefon" />
                  </FormField>
                  <FormField label="Brend" error={deviceForm.formState.errors.brand?.message} required>
                    <Input {...deviceForm.register('brand')} placeholder="Apple" />
                  </FormField>
                  <FormField label="Model" error={deviceForm.formState.errors.model?.message} required>
                    <Input {...deviceForm.register('model')} placeholder="iPhone 15 Pro" />
                  </FormField>
                  <FormField label="IMEI"><Input {...deviceForm.register('imei')} /></FormField>
                  <FormField label="Serial"><Input {...deviceForm.register('serialNumber')} /></FormField>
                  <FormField label="Rang"><Input {...deviceForm.register('color')} /></FormField>
                  <Button type="submit" disabled={deviceForm.formState.isSubmitting}>Qurilmani saqlash</Button>
                </form>
               )}
            </CardContent>
          </Card>

          {/* Step 3 — Qabul */}
          <Card>
            <CardHeader><CardTitle>3. Qabul tafsilotlari</CardTitle></CardHeader>
            <CardContent>
              {!deviceId ? <p className="muted">Avval qurilmani saqlang</p> : (
                <form onSubmit={receiveForm.handleSubmit(onReceive)} className="grid gap-3">
                  <FormField label="Filial" error={receiveForm.formState.errors.branchId?.message} required>
                    <Select {...receiveForm.register('branchId')}>
                      <option value="">Tanlang</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </FormField>
                  <FormField label="Mijoz shikoyati" error={receiveForm.formState.errors.complaint?.message} required>
                    <Textarea {...receiveForm.register('complaint')} />
                  </FormField>
                  <FormField label="Komplektatsiya">
                    <Input {...receiveForm.register('accessories')} placeholder="Telefon, kabel, chexol" />
                  </FormField>
                  <FormField label="Tashqi holat">
                    <Input {...receiveForm.register('condition')} placeholder="Ekran singan, tirnalgan" />
                  </FormField>
                  <FormField label="Holat rasmlari">
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple
                      onChange={e => setPhotos(Array.from(e.target.files ?? []).slice(0, 6))} />
                    <small>{photos.length} ta rasm tanlandi</small>
                  </FormField>
                  {receiveForm.formState.errors.root && <p className="error">{receiveForm.formState.errors.root.message}</p>}
                  {createOrder.error && <p className="error">{createOrder.error.message}</p>}
                  <Button type="submit" disabled={createOrder.isPending}>
                    {createOrder.isPending ? 'Saqlanmoqda...' : 'Qabul qilish'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <section>
        {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Raqam</th><th>Mijoz</th><th>Qurilma</th><th>Holat</th><th>Jami</th></tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id}>
                    <td><Link href={'/orders/' + o.id}>{o.number}</Link></td>
                    <td>{o.customer.firstName}<small>{o.customer.phone}</small></td>
                    <td>{o.device.brand} {o.device.model}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>{Number(o.total).toLocaleString('uz-UZ')} so'm</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 && <p className="muted">Hozircha buyurtmalar yo'q.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
