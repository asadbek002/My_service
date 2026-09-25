'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useWarranties } from '../../lib/queries';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { Badge } from '../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { useState } from 'react';
import { AppShell } from '../../components/layout/app-shell';

const claimSchema = z.object({ reason: z.string().min(3, 'Sabab majburiy') });
type ClaimInput = z.infer<typeof claimSchema>;

export default function Warranties() {
  const router = useRouter();
  const { data: warranties = [], isLoading } = useWarranties();
  const [claimId, setClaimId] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<{ id: string }>('/warranties/' + id + '/claim', { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: o => router.push('/orders/' + o.id),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<ClaimInput>({ resolver: zodResolver(claimSchema) });

  return (
    <AppShell title="Kafolatlar" subtitle="Kafolat">

      <section>
        {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Buyurtma</th><th>Qurilma</th><th>Mijoz</th><th>Tugash</th><th>Holat</th><th></th></tr></thead>
              <tbody>
                {warranties.map(w => {
                  const active = new Date(w.endDate) > new Date();
                  return (
                    <tr key={w.id}>
                      <td><Link href={'/orders/' + w.order.id}>{w.order.number}</Link></td>
                      <td>{w.order.device.brand} {w.order.device.model}</td>
                      <td>{w.order.customer.firstName}<small>{w.order.customer.phone}</small></td>
                      <td>{new Date(w.endDate).toLocaleDateString('uz-UZ')}</td>
                      <td><Badge variant={active ? 'success' : 'default'}>{active ? 'FAOL' : 'TUGAGAN'}</Badge></td>
                      <td>{active && <Button variant="secondary" size="sm" onClick={() => setClaimId(w.id)}>Kafolat qabuli</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {warranties.length === 0 && <p className="muted">Kafolatlar yo'q.</p>}
          </div>
        )}
      </section>

      {claimId && (
        <Card style={{ marginTop: 24, maxWidth: 480 }}>
          <CardHeader><CardTitle>Kafolat bo'yicha yangi buyurtma</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(d => claim.mutate({ id: claimId, reason: d.reason }))} className="grid gap-4">
              <FormField label="Muammo sababi" error={errors.reason?.message} required>
                <Textarea {...register('reason')} />
              </FormField>
              {claim.error && <p className="error">{(claim.error as Error).message}</p>}
              <div className="actions">
                <Button type="submit" disabled={claim.isPending}>{claim.isPending ? 'Yaratilmoqda...' : 'Yaratish'}</Button>
                <Button type="button" variant="secondary" onClick={() => setClaimId(null)}>Bekor qilish</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
