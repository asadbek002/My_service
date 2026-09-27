'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import { changePasswordSchema, type ChangePasswordInput } from '../../lib/schemas';
import { api, setAccessToken } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { deviceName, money, som, dateTime } from '../../lib/format';
import { can, useDashboard, useMe } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { AuthFrame } from '../../components/layout/auth-frame';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';

export default function Dashboard() {
  const { data: me } = useMe();
  if (me?.mustChangePassword) return <ChangePassword />;
  return <Home />;
}

function ChangePassword() {
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const { errors, isSubmitting } = form.formState;
  async function onSubmit(data: ChangePasswordInput) {
    try {
      const result = await api<{ accessToken: string; expiresIn: number }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }) });
      setAccessToken(result.accessToken, result.expiresIn);
      window.location.reload();
    } catch (e) {
      form.setError('root', { message: errorText(e) });
    }
  }
  return (
    <AuthFrame eyebrow="Birinchi kirish" title="Yangi parol qo'ying">
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <p className="text-sm text-mute">Sizga berilgan vaqtinchalik parolni o&apos;zingiz biladigan parolga almashtiring.</p>
        <FormField label="Vaqtinchalik parol" error={errors.currentPassword?.message}><Input {...form.register('currentPassword')} type="password" autoComplete="current-password" /></FormField>
        <FormField label="Yangi parol" error={errors.newPassword?.message} description="Kamida 12 belgi"><Input {...form.register('newPassword')} type="password" autoComplete="new-password" /></FormField>
        <FormField label="Yangi parolni takrorlang" error={errors.confirmPassword?.message}><Input {...form.register('confirmPassword')} type="password" autoComplete="new-password" /></FormField>
        <ErrorBox>{errors.root?.message}</ErrorBox>
        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>Parolni saqlash</Button>
      </form>
    </AuthFrame>
  );
}

const QUEUE = [
  ['RECEIVED', 'Qabul qilingan', 'Navbatda turibdi'],
  ['IN_REPAIR', "Ta'mirda", 'Ustada'],
  ['READY', 'Tayyor', 'Olib ketilishi kerak'],
] as const;

function Home() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useDashboard(!!me && can(me, 'reports.view'));
  const count = (s: string) => data?.statuses.find(x => x.status === s)?.count ?? 0;
  const max = Math.max(1, ...(data?.revenueByDay ?? []).map(d => Number(d.revenue)));

  return (
    <AppShell title={me ? `Salom, ${me.firstName}` : 'Asosiy'}>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {QUEUE.map(([status, label, hint]) => (
              <Link key={status} href={`/orders?status=${status}`} className="rounded-lg border bg-white p-3 hover:border-ink/40 sm:p-4">
                <p className="num font-mono text-2xl font-semibold sm:text-3xl">{count(status)}</p>
                <p className="mt-1 text-xs font-medium sm:text-sm">{label}</p>
                <p className="hidden text-xs text-mute sm:block">{hint}</p>
              </Link>
            ))}
          </div>

          <section className="talon">
            <div className="grid grid-cols-2 divide-x">
              <div className="p-4"><p className="eyebrow">Bugun kassa</p><p className="num mt-1 font-mono text-lg font-semibold sm:text-xl">{money(data.todayCash)}</p><p className="text-xs text-mute">{data.todayReceived} ta qabul</p></div>
              <div className="p-4"><p className="eyebrow">Shu oy</p><p className="num mt-1 font-mono text-lg font-semibold sm:text-xl">{money(data.monthCash)}</p><p className="text-xs text-mute">so&apos;m tushdi</p></div>
            </div>
            <div className="talon-cut" />
            <div className="p-4">
              <div className="flex h-20 items-end gap-1.5" aria-label="7 kunlik tushum">
                {data.revenueByDay.map(d => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${som(d.revenue)}`}>
                    <div className="w-full rounded-sm bg-ink/80" style={{ height: `${Math.max(3, (Number(d.revenue) / max) * 64)}px` }} />
                    <span className="num font-mono text-[10px] text-mute">{d.day.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>
            {Number(data.debt) > 0 && can(me, 'reports.finance') && (
              <Link href="/reports#debtors" className="flex items-center justify-between border-t px-4 py-3 text-sm hover:bg-paper">
                <span>Mijozlar qarzi</span>
                <span className="num flex items-center gap-1 font-mono font-semibold text-amber-700">{money(data.debt)}<ChevronRight className="h-4 w-4" /></span>
              </Link>
            )}
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-semibold">Oxirgi buyurtmalar</h2>
              <Link href="/orders?status=" className="text-sm text-mute hover:text-ink">Hammasi</Link>
            </div>
            {data.recent.length === 0 ? (
              <Empty title="Hali buyurtma yo'q">{can(me, 'orders.create') && <Link href="/orders/new" className="font-medium text-ink underline">Birinchi qurilmani qabul qiling</Link>}</Empty>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-white">
                {data.recent.map(o => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{deviceName(o.device)} <span className="font-normal text-mute">· {o.customer.firstName}</span></p>
                        <p className="num font-mono text-xs text-mute">{o.number} · {dateTime(o.createdAt)}</p>
                      </div>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
