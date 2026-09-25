'use client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clean } from '../../lib/utils';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { AppShell } from '../../components/layout/app-shell';

type Supplier = { id: string; name: string; phone: string; company?: string; telegram?: string; address?: string };
const supplierSchema = z.object({
  name: z.string().min(1, 'Nom majburiy').max(200),
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/, "Noto'g'ri telefon"),
  company: z.string().optional(),
  telegram: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type SupplierInput = z.infer<typeof supplierSchema>;

export default function Suppliers() {
  const qc = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => api<Supplier[]>('/suppliers') });
  const create = useMutation({
    mutationFn: (d: SupplierInput) => api('/suppliers', { method: 'POST', body: JSON.stringify(clean(d, ['name', 'phone', 'company', 'telegram', 'address', 'notes'])) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); reset(); },
  });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema) });

  return (
    <AppShell title="Ta'minotchilar" subtitle="Ombor">

      <div className="detail-grid">
        <Card>
          <CardHeader><CardTitle>Ro'yxat</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="muted">Yuklanmoqda...</p> : suppliers.map(s => (
              <div key={s.id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                {s.company && <p style={{ fontSize: 12, color: '#666' }}>{s.company}</p>}
                <p style={{ fontSize: 13 }}>{s.phone}{s.telegram ? ` · ${s.telegram}` : ''}</p>
                {s.address && <p style={{ fontSize: 12, color: '#999' }}>{s.address}</p>}
              </div>
            ))}
            {!isLoading && suppliers.length === 0 && <p className="muted">Yetkazib beruvchilar yo'q.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Yangi supplier</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(d => create.mutate(d))} className="grid gap-4">
              <FormField label="Nomi" error={errors.name?.message} required><Input {...register('name')} /></FormField>
              <FormField label="Telefon" error={errors.phone?.message} required><Input {...register('phone')} placeholder="+998901234567" /></FormField>
              <FormField label="Kompaniya"><Input {...register('company')} /></FormField>
              <FormField label="Telegram"><Input {...register('telegram')} placeholder="@username" /></FormField>
              <FormField label="Manzil"><Input {...register('address')} /></FormField>
              <FormField label="Izoh"><Textarea {...register('notes')} /></FormField>
              {create.error && <p className="error">{(create.error as Error).message}</p>}
              <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
