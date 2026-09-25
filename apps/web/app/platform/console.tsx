'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { platformApi } from './lib';

type Plan = { id: string; name: string; maxBranches: number | null; maxStaff: number | null; monthlyOrders: number | null; monthlyPrice: string; features: Record<string, boolean> };
type Org = { id: string; name: string; slug: string; createdAt: string; _count: { users: number; branches: number; orders: number }; subscription: { status: string; expiresAt: string; plan: Plan } | null };
type Analytics = { totalOrganizations: number; activeOrganizations: number; activeSubscriptions: number; trials: number; newOrganizations: number; churned: number; churnRate: number; mrr: string };
type System = { database: string; organizations: number; activeSubscriptions: number; pendingOutbox: number; failedNotifications: number };
type Invoice = { id: string; organizationId: string; amount: string; status: string; issuedAt: string };
type Usage = { id: string; organizationId: string; metric: string; quantity: number; period: string };
export type PlatformTab = 'overview' | 'organizations' | 'plans' | 'subscriptions' | 'system';

const TABS: [PlatformTab, string, string][] = [
  ['overview', 'Umumiy', '/platform'], ['organizations', 'Servislar', '/platform/organizations'], ['plans', 'Tariflar', '/platform/plans'],
  ['subscriptions', 'Obunalar', '/platform/subscriptions'], ['system', 'Tizim', '/platform/system'],
];
const FEATURES: [string, string][] = [['inventory', 'Ombor'], ['multi_branch', "Ko'p filial"], ['telegram', 'Telegram'], ['sms', 'SMS'], ['advanced_reports', 'Kengaytirilgan hisobot'], ['staff_commission', 'Usta komissiyasi'], ['exports', 'Eksport']];
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + " so'm";
const field = 'w-full h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm';
const card = 'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5';
const button = 'h-10 px-4 rounded-lg bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900 text-sm font-semibold disabled:opacity-50';

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className={card}><p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>;
}

export default function PlatformConsole({ tab }: { tab: PlatformTab }) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [system, setSystem] = useState<System | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = useCallback((e: unknown) => {
    if (e instanceof Error && e.message === 'SESSION_EXPIRED') router.replace('/platform/login');
    else setError(e instanceof Error ? e.message : 'Xato');
  }, [router]);
  const load = useCallback(async () => {
    const [p, o, a, s] = await Promise.all([platformApi<Plan[]>('/plans'), platformApi<Org[]>('/organizations'), platformApi<Analytics>('/analytics'), platformApi<System>('/system')]);
    setPlans(p); setOrgs(o); setAnalytics(a); setSystem(s);
    if (tab === 'system') { const [i, u] = await Promise.all([platformApi<Invoice[]>('/invoices'), platformApi<Usage[]>('/usage')]); setInvoices(i); setUsage(u); }
  }, [tab]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  async function submit(e: FormEvent<HTMLFormElement>, action: (d: FormData) => Promise<unknown>, done: string) {
    e.preventDefault(); const form = e.currentTarget; const d = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try { await action(d); form.reset(); await load(); setNotice(done); } catch (err) { fail(err); } finally { setBusy(false); }
  }
  async function logout() {
    try { await platformApi('/auth/logout', { method: 'POST' }); } catch { /* token is dropped either way */ }
    sessionStorage.removeItem('platform_token'); router.replace('/platform/login');
  }
  const orgName = Object.fromEntries(orgs.map(o => [o.id, o.name]));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold tracking-wider text-sm">MY SERVICE · PLATFORM</span>
          <button onClick={logout} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">Chiqish</button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(([key, label, href]) => (
            <Link key={key} href={href} className={`px-3 py-2 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === key ? 'border-zinc-900 dark:border-zinc-50' : 'border-transparent text-zinc-500'}`}>{label}</Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
        {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{notice}</p>}

        {tab === 'overview' && analytics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Jami servislar" value={analytics.totalOrganizations} />
            <Stat label="Faol servislar" value={analytics.activeOrganizations} />
            <Stat label="Faol obunalar" value={analytics.activeSubscriptions} />
            <Stat label="Sinov (trial)" value={analytics.trials} />
            <Stat label="MRR" value={money(analytics.mrr)} />
            <Stat label="Yangi (30 kun)" value={analytics.newOrganizations} />
            <Stat label="Churn" value={analytics.churned} />
            <Stat label="Churn darajasi" value={analytics.churnRate + '%'} />
          </div>
        )}

        {(tab === 'organizations' || tab === 'overview') && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className={card + ' lg:col-span-2 overflow-x-auto'}>
              <h2 className="font-semibold mb-3">Servislar</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-zinc-500">{['Servis', 'Tarif', 'Holat', 'Filial', 'Xodim', 'Buyurtma'].map(h => <th key={h} className="py-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {orgs.map(o => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3"><b>{o.name}</b><span className="block text-xs text-zinc-400">{o.slug}</span></td>
                      <td className="py-2 pr-3">{o.subscription?.plan.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs">{o.subscription ? `${o.subscription.status} · ${new Date(o.subscription.expiresAt).toLocaleDateString('ru-RU')}` : '—'}</td>
                      <td className="py-2 pr-3">{o._count.branches}</td><td className="py-2 pr-3">{o._count.users}</td><td className="py-2 pr-3">{o._count.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {tab === 'organizations' && (
              <section className={card}>
                <h2 className="font-semibold mb-3">Yangi servis</h2>
                <form className="space-y-3" onSubmit={e => submit(e, d => platformApi('/organizations', { method: 'POST', body: JSON.stringify(Object.fromEntries(d)) }), "Servis yaratildi: egasi birinchi kirishda parolni almashtiradi")}>
                  <input name="name" required placeholder="Servis nomi" className={field} />
                  <input name="slug" required pattern="[a-z0-9-]{3,64}" placeholder="slug (lotin, kichik harf)" className={field} />
                  <select name="planId" required className={field}>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <input name="ownerName" required placeholder="Egasi ismi" className={field} />
                  <input name="phone" required pattern="\+[1-9][0-9]{7,14}" placeholder="+998901234567" className={field} />
                  <input name="login" required pattern="[a-zA-Z0-9_.\-]{3,64}" placeholder="Login" className={field} />
                  <input name="temporaryPassword" type="password" minLength={12} required placeholder="Vaqtinchalik parol (12+)" className={field} />
                  <button className={button + ' w-full'} disabled={busy || plans.length === 0}>Yaratish</button>
                  {plans.length === 0 && <p className="text-xs text-amber-600">Avval tarif yarating</p>}
                </form>
              </section>
            )}
          </div>
        )}

        {tab === 'plans' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className={card + ' lg:col-span-2 space-y-3'}>
              <h2 className="font-semibold">Tariflar</h2>
              {plans.map(p => (
                <div key={p.id} className="p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 text-sm">
                  <p className="font-semibold">{p.name} · {money(p.monthlyPrice)}/oy</p>
                  <p className="text-xs text-zinc-500">Filial: {p.maxBranches ?? '∞'} · Xodim: {p.maxStaff ?? '∞'} · Buyurtma/oy: {p.monthlyOrders ?? '∞'}</p>
                  <p className="text-xs text-zinc-500">{FEATURES.filter(([k]) => p.features?.[k]).map(([, l]) => l).join(' · ') || 'Qo‘shimcha imkoniyat yo‘q'}</p>
                </div>
              ))}
            </section>
            <section className={card}>
              <h2 className="font-semibold mb-3">Yangi tarif</h2>
              <form className="space-y-3" onSubmit={e => submit(e, d => platformApi('/plans', { method: 'POST', body: JSON.stringify({
                name: d.get('name'),
                ...(Number(d.get('maxBranches')) ? { maxBranches: Number(d.get('maxBranches')) } : {}),
                ...(Number(d.get('maxStaff')) ? { maxStaff: Number(d.get('maxStaff')) } : {}),
                ...(Number(d.get('monthlyOrders')) ? { monthlyOrders: Number(d.get('monthlyOrders')) } : {}),
                monthlyPrice: String(d.get('monthlyPrice') || '0'),
                features: Object.fromEntries(FEATURES.map(([k]) => [k, d.get(k) === 'on'])),
              }) }), 'Tarif yaratildi')}>
                <input name="name" required placeholder="Nomi (START, BUSINESS...)" className={field} />
                <div className="grid grid-cols-3 gap-2">
                  <input name="maxBranches" type="number" min={1} placeholder="Filial" className={field} />
                  <input name="maxStaff" type="number" min={1} placeholder="Xodim" className={field} />
                  <input name="monthlyOrders" type="number" min={1} placeholder="Buyurtma" className={field} />
                </div>
                <p className="text-[11px] text-zinc-400">Bo&apos;sh qoldirilsa — cheksiz</p>
                <input name="monthlyPrice" required pattern="\d{1,12}(\.\d{1,2})?" placeholder="Oylik narx" defaultValue="0" className={field} />
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  {FEATURES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={k === 'inventory'} className="h-4 w-4" />{l}</label>)}
                </div>
                <button className={button + ' w-full'} disabled={busy}>Tarif yaratish</button>
              </form>
            </section>
          </div>
        )}

        {tab === 'subscriptions' && (
          <section className={card + ' space-y-3'}>
            <h2 className="font-semibold">Obunalar</h2>
            <p className="text-xs text-zinc-500">Muddati tugagan yoki to&apos;xtatilgan servis ma&apos;lumotlarini ko&apos;ra oladi, lekin o&apos;zgartira olmaydi. Ma&apos;lumotlar o&apos;chirilmaydi.</p>
            {orgs.map(o => (
              <form key={o.id + (o.subscription?.expiresAt ?? '')} className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2 items-center p-3 rounded-lg border border-zinc-100 dark:border-zinc-800"
                onSubmit={e => submit(e, d => platformApi('/organizations/' + o.id + '/subscription', { method: 'PATCH', body: JSON.stringify({ planId: d.get('planId'), status: d.get('status'), expiresAt: new Date(String(d.get('expiresAt')) + 'T23:59:59+05:00').toISOString() }) }), `${o.name}: obuna yangilandi`)}>
                <span className="text-sm"><b>{o.name}</b><span className="block text-xs text-zinc-400">{o.slug}</span></span>
                <select name="planId" defaultValue={o.subscription?.plan.id ?? plans[0]?.id} className={field} aria-label="Tarif">{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select name="status" defaultValue={o.subscription?.status ?? 'TRIAL'} className={field} aria-label="Holat">{['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map(s => <option key={s} value={s}>{s}</option>)}</select>
                <input name="expiresAt" type="date" required defaultValue={(o.subscription ? new Date(o.subscription.expiresAt) : new Date(Date.now() + 30 * 86400000)).toISOString().slice(0, 10)} className={field} aria-label="Tugash sanasi" />
                <button className={button} disabled={busy}>Saqlash</button>
              </form>
            ))}
          </section>
        )}

        {tab === 'system' && system && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Database" value={system.database} />
              <Stat label="Faol obunalar" value={system.activeSubscriptions} />
              <Stat label="Navbatdagi eventlar" value={system.pendingOutbox} />
              <Stat label="Xato xabarnomalar" value={system.failedNotifications} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className={card}>
                <h2 className="font-semibold mb-3">Hisob-fakturalar</h2>
                {invoices.length === 0 ? <p className="text-sm text-zinc-400">Hali yo&apos;q</p> : invoices.map(i => <p key={i.id} className="text-sm flex justify-between py-1"><span>{orgName[i.organizationId] ?? i.organizationId}</span><span>{money(i.amount)} · {i.status}</span></p>)}
              </section>
              <section className={card}>
                <h2 className="font-semibold mb-3">Foydalanish</h2>
                {usage.length === 0 ? <p className="text-sm text-zinc-400">Hali yo&apos;q</p> : usage.map(u => <p key={u.id} className="text-sm flex justify-between py-1"><span>{orgName[u.organizationId] ?? u.organizationId} · {u.metric}</span><span>{u.quantity}</span></p>)}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
