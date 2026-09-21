'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMe, useStaff, useBranches, useCreateStaff } from '../../lib/queries';
import { staffSchema, type StaffInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function StaffPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, error: meError } = useMe();
  const { data: staff = [], isLoading } = useStaff();
  const { data: branches = [] } = useBranches();
  const createStaff = useCreateStaff();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<StaffInput>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: 'TECHNICIAN' },
  });

  if (meError?.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }

  const canManage = me?.permissions.includes('staff.manage');

  async function onSubmit(data: StaffInput) {
    try {
      await createStaff.mutateAsync({ ...data, branchIds: [data.branchId] });
      reset();
    } catch (e) { /* error createStaff.error dan */ }
  }

  async function toggleStatus(user: typeof staff[0]) {
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api('/staff/' + user.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: next }) });
    qc.invalidateQueries({ queryKey: ['staff'] });
  }

  return (
    <main className="page">
      <header>
        <Link href="/dashboard" className="brand">MY SERVICE</Link>
        <Link href="/dashboard">Bosh sahifa</Link>
      </header>

      <div className="title-row">
        <div><p className="eyebrow">JAMOA</p><h1>Xodimlar</h1></div>
      </div>

      <div className="staff-layout">
        <section>
          {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Ism</th><th>Login</th><th>Lavozim</th><th>Filial</th><th>Holat</th>{canManage && <th></th>}</tr></thead>
                <tbody>
                  {staff.map(u => (
                    <tr key={u.id}>
                      <td><Link href={'/staff/' + u.id}>{u.firstName}</Link><small>{u.phone}</small></td>
                      <td>{u.login}</td>
                      <td>{u.roles.map(r => r.role.name).join(', ')}</td>
                      <td>{u.branches.map(b => b.branch.name).join(', ')}</td>
                      <td><StatusBadge status={u.status} /></td>
                      {canManage && (
                        <td>
                          <Button variant="secondary" size="sm" onClick={() => toggleStatus(u)} disabled={u.roles.some(r => r.role.systemKey === 'OWNER')}>
                            {u.status === 'ACTIVE' ? 'To\'xtatish' : 'Faollashtirish'}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {staff.length === 0 && <p className="muted">Xodimlar yo'q.</p>}
            </div>
          )}
        </section>

        {canManage && (
          <Card>
            <CardHeader><CardTitle>Yangi xodim</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
                <FormField label="Login" error={errors.login?.message} required>
                  <Input {...register('login')} placeholder="aziz_usta" />
                </FormField>
                <FormField label="Ism" error={errors.firstName?.message} required>
                  <Input {...register('firstName')} placeholder="Aziz" />
                </FormField>
                <FormField label="Telefon" error={errors.phone?.message} required>
                  <Input {...register('phone')} placeholder="+998901234567" />
                </FormField>
                <FormField label="Vaqtinchalik parol" error={errors.temporaryPassword?.message} required>
                  <Input {...register('temporaryPassword')} type="password" placeholder="Kamida 12 belgi" />
                </FormField>
                <FormField label="Lavozim" error={errors.role?.message} required>
                  <Select {...register('role')}>
                    <option value="TECHNICIAN">Usta</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </FormField>
                <FormField label="Filial" error={errors.branchId?.message} required>
                  <Select {...register('branchId')}>
                    <option value="">Tanlang</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </FormField>
                {createStaff.error && <p role="alert" className="error">{createStaff.error.message}</p>}
                <Button type="submit" disabled={isSubmitting || createStaff.isPending}>
                  {createStaff.isPending ? 'Saqlanmoqda...' : 'Xodim qo\'shish'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
