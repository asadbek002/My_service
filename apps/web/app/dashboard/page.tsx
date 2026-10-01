'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import { changePasswordSchema, type ChangePasswordInput } from '../../lib/schemas';
import { api, setAccessToken } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { deviceName, money, som, dateTime } from '../../lib/format';
import { can, useDashboard, useMe, useOrders } from '../../lib/queries';
import { OrderCard } from '../../components/order-card';
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
  ['RECEIVED', 'Qabulda', 'Navbatda turibdi', 'bg-ink'],
  ['IN_REPAIR', "Ta'mirda", 'Ustada', 'bg-blue-600'],
  ['READY', 'Tayyor', 'Olib ketiladi', 'bg-emerald-600'],
] as const;

function Home() {
  const { data: me } = useMe();
  // Staff without "reports.view" (Settings → roles) see the work queue, not the money.
  if (me && !can(me, 'reports.view')) return <WorkHome firstName={me.firstName} canCreate={can(me, 'orders.create')} canView={can(me, 'orders.view')} />;
  return <MoneyHome />;
}

function WorkHome({ firstName, canCreate, canView }: { firstName: string; canCreate: boolean; canView: boolean }) {
  const { data: orders, isLoading, error } = useOrders('open', canView);
  const count = (s: string) => orders?.filter(o => o.status === s).length ?? 0;
  return (
    <AppShell title={`Salom, ${firstName}`}>
      {!canView ? <Empty title="Sizga hali ruxsat berilmagan">Boshliq Sozlamalar → «Rollar va ruxsatlar» da ruxsat beradi.</Empty>
        : error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !orders ? <Loading rows={4} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([['RECEIVED', 'Navbatda'], ['IN_REPAIR', "Ta'mirda"], ['READY', 'Tayyor']] as const).map(([status, label]) => (
              <Link key={status} href={`/orders?status=${status}`} className="rounded-lg border bg-white p-3">
                <p className="num font-mono text-2xl font-semibold">{count(status)}</p><p className="text-xs font-medium">{label}</p>
              </Link>
            ))}
          </div>
          {canCreate && <Button asChild size="lg" className="w-full"><Link href="/orders/new">Yangi qabul</Link></Button>}
          <h2 className="font-semibold">Ishdagi buyurtmalar</h2>
          {orders.length === 0 ? <Empty title="Hozir ishda buyurtma yo'q" /> : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{orders.slice(0, 20).map(o => <OrderCard key={o.id} order={o} />)}</div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function MoneyHome() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useDashboard(!!me && can(me, 'reports.view'));
  const count = (s: string) => data?.statuses.find(x => x.status === s)?.count ?? 0;
  const days = data?.revenueByDay ?? [];
  const max = Math.max(1, ...days.map(d => Number(d.revenue)));

  return (
    <AppShell title={me ? `Salom, ${me.firstName}` : 'Asosiy'}>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
          <div className="min-w-0 space-y-4 lg:col-span-3 lg:space-y-5">
            {/* Today's cash: the dark talon, the one loud block on the screen. */}
            <section className="talon-dark on-ink overflow-hidden">
              <div className="grid grid-cols-[1fr_auto] items-end gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Bugun kassa</p>
                  <p className="num mt-1.5 truncate font-mono text-[2rem] font-semibold leading-none tracking-tight sm:text-4xl">{money(data.todayCash)}</p>
                  <p className="mt-2 text-sm text-white/60">so&apos;m · {data.todayReceived} ta qabul</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Shu oy</p>
                  <p className="num mt-1.5 font-mono text-base font-semibold sm:text-lg">{money(data.monthCash)}</p>
                </div>
              </div>
              <div className="talon-cut" />
              <div className="px-5 pb-4 pt-4 sm:px-6">
                <div className="flex h-24 items-end gap-2" role="img" aria-label="7 kunlik tushum">
                  {days.map((d, i) => {
                    const last = i === days.length - 1;
                    return (
                      <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.day}: ${som(d.revenue)}`}>
                        <div className={last ? 'w-full rounded-md bg-brand' : 'w-full rounded-md bg-white/20'} style={{ height: `${Math.max(4, (Number(d.revenue) / max) * 72)}px` }} />
                        <span className={last ? 'num font-mono text-[11px] font-semibold text-brand' : 'num font-mono text-[11px] text-white/50'}>{d.day.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {QUEUE.map(([status, label, hint, dot]) => (
                <Link key={status} href={`/orders?status=${status}`} className="group rounded-xl border bg-white p-3 transition-colors hover:border-ink/40 active:bg-paper sm:p-4">
                  <div className="flex items-center justify-between">
                    <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
                    <ChevronRight className="h-4 w-4 text-mute transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="num mt-3 font-mono text-3xl font-semibold leading-none">{count(status)}</p>
                  <p className="mt-2 truncate text-[13px] font-semibold sm:text-sm">{label}</p>
                  <p className="truncate text-xs text-mute">{hint}</p>
                </Link>
              ))}
            </div>

            {Number(data.debt) > 0 && can(me, 'reports.finance') && (
              <Link href="/reports#debtors" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 transition-colors hover:border-amber-300">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-amber-900">Mijozlar qarzi</span>
                  <span className="block text-xs text-amber-800">Berilgan, lekin to&apos;lanmagan</span>
                </span>
                <span className="num font-mono text-base font-semibold text-amber-900">{money(data.debt)}</span>
                <ChevronRight className="h-4 w-4 text-amber-800" />
              </Link>
            )}
          </div>

          <section className="min-w-0 lg:col-span-2">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="text-base font-bold">Oxirgi buyurtmalar</h2>
              <Link href="/orders?status=" className="flex items-center gap-0.5 text-sm font-medium text-mute hover:text-ink">Hammasi<ChevronRight className="h-4 w-4" /></Link>
            </div>
            {data.recent.length === 0 ? (
              <Empty title="Hali buyurtma yo'q">{can(me, 'orders.create') && <Link href="/orders/new" className="font-medium text-ink underline">Birinchi qurilmani qabul qiling</Link>}</Empty>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-white">
                {data.recent.map(o => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-paper active:bg-black/[0.03]">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{deviceName(o.device)}</p>
                        <p className="truncate text-xs text-mute">{o.customer.firstName} · <span className="num font-mono">{o.number}</span> · {dateTime(o.createdAt)}</p>
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
