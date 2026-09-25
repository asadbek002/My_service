'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBranches, useMe } from '../../lib/queries';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { AppShell } from '../../components/layout/app-shell';

const branchSchema = z.object({ name: z.string().min(1, 'Nom majburiy').max(100) });
type BranchInput = z.infer<typeof branchSchema>;

export default function Branches() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: branches = [], isLoading } = useBranches();
  const { data: me } = useMe();
  const create = useMutation({
    mutationFn: (data: BranchInput) => api('/branches', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); reset(); },
  });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<BranchInput>({ resolver: zodResolver(branchSchema) });

  return (
    <AppShell title="Filiallar" subtitle="Tashkilot">

      <div className="detail-grid">
        <Card>
          <CardHeader><CardTitle>Faol filiallar</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <p className="muted">Yuklanmoqda...</p> : branches.map(b => (
              <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee' }}>
                <strong style={{ fontSize: 14 }}>{b.name}</strong>
                <small style={{ display: 'block', color: '#999', fontSize: 11 }}>{b.id}</small>
              </div>
            ))}
            {!isLoading && branches.length === 0 && <p className="muted">Filiallar yo'q.</p>}
          </CardContent>
        </Card>

        {me?.permissions.includes('settings.manage') && (
          <Card>
            <CardHeader><CardTitle>Yangi filial</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(d => create.mutate(d))} className="grid gap-4">
                <FormField label="Filial nomi" error={errors.name?.message} required>
                  <Input {...register('name')} placeholder="Chilonzor filiali" />
                </FormField>
                {create.error && <p className="error">{(create.error as Error).message}</p>}
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Yaratilmoqda...' : 'Filial yaratish'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
