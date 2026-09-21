'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useBranches } from '../../lib/queries';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';

const CATEGORIES = ['RENT','SALARY','DELIVERY','ADVERTISEMENT','UTILITY','TRANSPORT','PURCHASE','OTHER'];

const expenseSchema = z.object({
  branchId: z.string().min(1, 'Filial tanlang'),
  category: z.string().min(1, 'Kategoriya majburiy'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Noto'g'ri summa"),
  note: z.string().min(3, 'Izoh majburiy'),
});
type ExpenseInput = z.infer<typeof expenseSchema>;

export default function Expenses() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: branches = [] } = useBranches();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api<{ id: string; category: string; amount: string; note: string; createdAt: string }[]>('/expenses'),
  });
  const create = useMutation({
    mutationFn: (data: ExpenseInput) => api('/expenses', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); reset(); },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: 'OTHER' },
  });

  if (create.error instanceof Error && create.error.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }

  return (
    <main className="page">
      <header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/reports">Hisobotlar</Link></header>
      <div className="title-row"><div><p className="eyebrow">MOLIYA</p><h1>Xarajatlar</h1></div></div>

      <div className="detail-grid">
        <section>
          {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Sana</th><th>Kategoriya</th><th>Izoh</th><th>Summa</th></tr></thead>
                <tbody>
                  {items.map(x => (
                    <tr key={x.id}>
                      <td>{new Date(x.createdAt).toLocaleDateString('uz-UZ')}</td>
                      <td>{x.category}</td>
                      <td>{x.note}</td>
                      <td>{Number(x.amount).toLocaleString('uz-UZ')} so'm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && <p className="muted">Xarajatlar yo'q.</p>}
            </div>
          )}
        </section>

        <Card>
          <CardHeader><CardTitle>Xarajat qo'shish</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(d => create.mutate(d))} className="grid gap-4">
              <FormField label="Filial" error={errors.branchId?.message} required>
                <Select {...register('branchId')}>
                  <option value="">Tanlang</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </FormField>
              <FormField label="Kategoriya" error={errors.category?.message} required>
                <Select {...register('category')}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </FormField>
              <FormField label="Summa (so'm)" error={errors.amount?.message} required>
                <Input {...register('amount')} placeholder="500000" />
              </FormField>
              <FormField label="Izoh" error={errors.note?.message} required>
                <Textarea {...register('note')} />
              </FormField>
              {create.error && <p className="error">{(create.error as Error).message}</p>}
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
