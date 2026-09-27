'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Plus } from 'lucide-react';
import { staffSchema, type StaffInput } from '../../lib/schemas';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { fullName, normalizePhone, phone } from '../../lib/format';
import { can, useMe, useStaff, type Staff } from '../../lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { ErrorBox, Loading, Notice } from '../../components/ui/feedback';

export default function Page() {
  return <Suspense><StaffList /></Suspense>;
}

function StaffList() {
  const { data: me } = useMe();
  const { data: staff, isLoading, error } = useStaff();
  const [open, setOpen] = useState(useSearchParams().get('new') === '1');
  const [created, setCreated] = useState('');
  const manage = can(me, 'staff.manage');
  return (
    <AppShell title="Xodimlar" narrow action={manage && !open && <Button size="sm" onClick={() => { setOpen(true); setCreated(''); }}><Plus className="h-4 w-4" /> Qo&apos;shish</Button>}>
      <div className="space-y-4">
        {open && <CreateStaff onDone={login => { setOpen(false); setCreated(login); }} onClose={() => setOpen(false)} />}
        <Notice>{created && `Xodim qo'shildi. Unga login (${created}) va vaqtinchalik parolni bering — birinchi kirishda o'z parolini qo'yadi.`}</Notice>
        {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading /> : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-white">
            {staff?.map(s => <StaffRow key={s.id} s={s} />)}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function StaffRow({ s }: { s: Staff }) {
  const owner = s.roles.some(r => r.role.systemKey === 'OWNER');
  return (
    <li>
      <Link href={`/staff/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-sm font-semibold">{s.firstName.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{fullName(s)} <span className="text-xs font-normal text-mute">· {owner ? 'Boshliq' : 'Xodim'}</span></p>
          <p className="num truncate font-mono text-xs text-mute">{s.login} · {phone(s.phone)}</p>
        </div>
        {s.status !== 'ACTIVE' && <StatusBadge status={s.status} />}
        {s.mustChangePassword && s.status === 'ACTIVE' && <span className="hidden text-xs text-amber-700 sm:inline">parol kutilmoqda</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
      </Link>
    </li>
  );
}

function CreateStaff({ onDone, onClose }: { onDone: (login: string) => void; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<StaffInput>({ resolver: zodResolver(staffSchema) });
  async function submit(d: StaffInput) {
    try {
      const body = { firstName: d.firstName.trim(), ...(d.lastName?.trim() ? { lastName: d.lastName.trim() } : {}), phone: d.phone, login: d.login.trim().toLowerCase(), temporaryPassword: d.temporaryPassword };
      await api('/staff', { method: 'POST', body: JSON.stringify(body) });
      await qc.invalidateQueries({ queryKey: ['staff'] });
      onDone(body.login);
    } catch (e) { setError('root', { message: errorText(e) }); }
  }
  const phoneField = register('phone', { setValueAs: (v: string) => normalizePhone(v) });
  return (
    <section className="rounded-lg border-2 border-ink bg-white p-4">
      <h2 className="font-semibold">Yangi xodim</h2>
      <p className="mt-0.5 text-sm text-mute">Xodim hamma ishni qila oladi: qabul, to&apos;lov, hisobot, sozlamalar.</p>
      <form onSubmit={handleSubmit(submit)} className="mt-4 grid gap-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ism" error={errors.firstName?.message}><Input {...register('firstName')} autoCapitalize="words" /></FormField>
          <FormField label="Familiya"><Input {...register('lastName')} autoCapitalize="words" /></FormField>
        </div>
        <FormField label="Telefon" error={errors.phone?.message}><Input {...phoneField} inputMode="tel" placeholder="+998 90 123 45 67" /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Login" error={errors.login?.message}><Input {...register('login')} autoCapitalize="none" autoCorrect="off" spellCheck={false} /></FormField>
          <FormField label="Vaqtinchalik parol" error={errors.temporaryPassword?.message} description="Kamida 12 belgi"><Input {...register('temporaryPassword')} autoCapitalize="none" autoComplete="new-password" /></FormField>
        </div>
        <ErrorBox>{errors.root?.message}</ErrorBox>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Bekor</Button>
          <Button disabled={isSubmitting} className="flex-1 sm:flex-none">Qo&apos;shish</Button>
        </div>
      </form>
    </section>
  );
}
