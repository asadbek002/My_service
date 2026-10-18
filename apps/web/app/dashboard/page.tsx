'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight } from 'lucide-react';
import { changePasswordSchema, type ChangePasswordInput } from '../../lib/schemas';
import { api, setAccessToken } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { deviceName, money, dateTime, today } from '../../lib/format';
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
  ['RECEIVED', 'Qabulda', 'Navbatda turibdi', 'bg-[#A9B8B5]'],
  ['IN_REPAIR', "Ta'mirda", 'Ustada', 'bg-[#6E93FF]'],
  ['READY', 'Tayyor', 'Olib ketiladi', 'bg-[#33C47A]'],
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
  const open = count('RECEIVED') + count('IN_REPAIR') + count('READY');
  // Ready devices that have waited longest first: these are the calls to make today.
  const { data: ready } = useOrders('READY', !!me && can(me, 'orders.view'));
  const waiting = [...(ready ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 5);

  return (
    <AppShell title={me ? `Salom, ${me.firstName}` : 'Asosiy'}>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading || !data ? <Loading rows={4} /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
          <div className="min-w-0 space-y-5 lg:col-span-3">
            {/* The counter: how many devices are in the shop and where they stand, then the money. */}
            <section className="talon-dark on-ink overflow-hidden">
              <div className="p-5 sm:p-6">
                <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-white/60"><span>Peshtaxtada</span><span>{today().slice(8)}.{today().slice(5, 7)}</span></div>
                <p className="mt-2 flex items-baseline gap-2.5"><span className="num font-mono text-[3.5rem] font-semibold leading-none tracking-tight">{open}</span><span className="text-lg font-medium">ta qurilma</span></p>
                <div className="mt-4 flex h-2.5 gap-[3px]" role="img" aria-label={`${count('RECEIVED')} qabulda, ${count('IN_REPAIR')} ta'mirda, ${count('READY')} tayyor`}>
                  {open === 0 ? <span className="flex-1 rounded-full bg-white/15" /> : QUEUE.map(([status, , , bar]) => count(status) > 0 && <span key={status} className={`rounded-full ${bar}`} style={{ flexGrow: count(status) }} />)}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-white/80">
                  {QUEUE.map(([status, label, , bar]) => (
                    <Link key={status} href={`/orders?status=${status}`} className="flex items-center gap-1.5 hover:text-white"><span className={`h-2 w-2 rounded-full ${bar}`} />{count(status)} {label.toLowerCase()}</Link>
                  ))}
                </div>
              </div>
              <div className="talon-cut" />
              <div className="grid grid-cols-3 gap-3 px-5 pb-5 pt-4 sm:px-6">
                <div className="min-w-0"><p className="text-xs text-white/60">Bugungi kassa</p><p className="num mt-1 font-mono text-[15px] font-semibold sm:text-xl">{money(data.todayCash)}</p></div>
                <div className="min-w-0"><p className="text-xs text-white/60">Shu oy</p><p className="num mt-1 font-mono text-[15px] font-semibold sm:text-xl">{money(data.monthCash)}</p></div>
                {can(me, 'reports.finance') ? (
                  <Link href="/reports#debtors" className="min-w-0"><p className="text-xs text-white/60">Mijozlar qarzi</p><p className="num mt-1 font-mono text-[15px] font-semibold text-[#FFB547] sm:text-xl">{money(data.debt)}</p></Link>
                ) : <div />}
              </div>
            </section>

            {waiting.length > 0 && (
              <section>
                <div className="mb-2.5">
                  <h2 className="text-base font-bold">Egasini kutayotganlar</h2>
                  <p className="text-[13px] text-mute">{count('READY')} ta qurilma tayyor, olib ketilmagan</p>
                </div>
                <div className="grid gap-2.5">{waiting.map(o => <OrderCard key={o.id} order={o} />)}</div>
              </section>
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
