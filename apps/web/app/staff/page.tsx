'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UserCheck,
  Plus,
  Shield,
  Phone,
  Building2,
  ChevronRight,
  UserX,
} from 'lucide-react';
import { useMe, useStaff, useBranches, useCreateStaff } from '../../lib/queries';
import { staffSchema, type StaffInput } from '../../lib/schemas';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select } from '../../components/ui/select';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function StaffPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, error: meError } = useMe();
  const { data: staff = [], isLoading } = useStaff();
  const { data: branches = [] } = useBranches();
  const createStaff = useCreateStaff();
  const [showAddForm, setShowAddForm] = useState(false);
  // /staff/new lands here with ?new=1
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new')) setShowAddForm(true); }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffInput>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: 'TECHNICIAN' },
  });

  if (meError?.message === 'SESSION_EXPIRED') {
    router.replace('/login');
    return null;
  }

  const canManage = me?.permissions.includes('staff.manage');

  async function onSubmit(data: StaffInput) {
    try {
      // Send only what the API accepts: it rejects unknown fields.
      await createStaff.mutateAsync({
        login: data.login, firstName: data.firstName, phone: data.phone, temporaryPassword: data.temporaryPassword, role: data.role,
        branchIds: [data.branchId], ...(data.lastName ? { lastName: data.lastName } : {}),
      });
      reset();
      setShowAddForm(false);
    } catch { /* shown via createStaff.error */ }
  }

  async function toggleStatus(user: typeof staff[0]) {
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await api('/staff/' + user.id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    qc.invalidateQueries({ queryKey: ['staff'] });
  }

  return (
    <AppShell
      subtitle="Jamoa boshqaruvi"
      title="Xodimlar va ustalar"
      action={
        canManage ? (
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-2 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>{showAddForm ? 'Formani yopish' : 'Yangi xodim'}</span>
          </Button>
        ) : null
      }
    >
      <div className="space-y-6">
        {/* Add Staff Inline Panel */}
        {showAddForm && (
          <Card className="border-zinc-300 dark:border-zinc-700 shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Yangi xodim yaratish</CardTitle>
              <CardDescription>
                Xodim uchun login, vaqtinchalik parol va tegishli rolni biriktiring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Login" error={errors.login?.message} required>
                    <Input {...register('login')} placeholder="aziz_usta" />
                  </FormField>
                  <FormField label="Ism" error={errors.firstName?.message} required>
                    <Input {...register('firstName')} placeholder="Aziz" />
                  </FormField>
                  <FormField label="Telefon" error={errors.phone?.message} required>
                    <Input {...register('phone')} placeholder="+998901234567" />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    label="Vaqtinchalik parol"
                    error={errors.temporaryPassword?.message}
                    required
                  >
                    <Input
                      {...register('temporaryPassword')}
                      type="password"
                      placeholder="Kamida 12 belgi"
                    />
                  </FormField>
                  <FormField label="Lavozim / Rol" error={errors.role?.message} required>
                    <Select {...register('role')}>
                      <option value="TECHNICIAN">Usta (TECHNICIAN)</option>
                      <option value="MANAGER">Menejer (MANAGER)</option>
                      <option value="ADMIN">Administrator (ADMIN)</option>
                    </Select>
                  </FormField>
                  <FormField label="Asosiy filial" error={errors.branchId?.message} required>
                    <Select {...register('branchId')}>
                      <option value="">Filialni tanlang...</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>

                {createStaff.error && (
                  <p role="alert" className="text-sm text-red-600">
                    {createStaff.error.message === 'Login unavailable' ? 'Bu login band' : createStaff.error.message === 'STAFF_LIMIT' ? "Tarif bo'yicha xodimlar limiti tugagan" : createStaff.error.message}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    Bekor qilish
                  </Button>
                  <Button type="submit" size="sm" disabled={isSubmitting || createStaff.isPending}>
                    {createStaff.isPending ? 'Saqlanmoqda...' : 'Xodimni yaratish'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Staff Table */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-zinc-400">Yuklanmoqda...</div>
            ) : staff.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
                      <th className="py-3 px-4">Xodim</th>
                      <th className="py-3 px-4">Login</th>
                      <th className="py-3 px-4">Rol</th>
                      <th className="py-3 px-4">Filial</th>
                      <th className="py-3 px-4">Holat</th>
                      {canManage && <th className="py-3 px-4 text-right">Amal</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {staff.map(u => (
                      <tr
                        key={u.id}
                        className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <Link href={'/staff/' + u.id} className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 hover:underline flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300">
                              {u.firstName[0]}
                            </div>
                            <div>
                              <span>{u.firstName} {u.lastName ?? ''}</span>
                              <div className="text-[11px] text-zinc-400 font-normal">{u.phone}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {u.login}
                        </td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-[10px]">
                            {u.roles.map(r => r.role.name).join(', ')}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-zinc-600 dark:text-zinc-400">
                          {u.branches.map(b => b.branch.name).join(', ') || '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={u.status} />
                        </td>
                        {canManage && (
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => toggleStatus(u)}
                              disabled={u.roles.some(r => r.role.systemKey === 'OWNER')}
                            >
                              {u.status === 'ACTIVE' ? 'Toʻxtatish' : 'Faollashtirish'}
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-zinc-400">Xodimlar topilmadi</div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
