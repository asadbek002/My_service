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
const FEATURES: [string, string][] = [['telegram', 'Telegram'], ['sms', 'SMS'], ['exports', 'Eksport']];
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + " so'm";
const field = 'w-full h-11 sm:h-10 rounded-md border border-line bg-white px-3 text-base sm:text-sm focus:border-ink focus:outline-none';
const card = 'rounded-lg border bg-white p-4 sm:p-5';
const button = 'h-11 sm:h-10 px-4 rounded-md bg-ink text-white text-sm font-semibold disabled:opacity-50';

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className={card}><p className="eyebrow">{label}</p><p className="num mt-1 font-mono text-xl font-semibold sm:text-2xl">{value}</p></div>;
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
    <div className="min-h-[100dvh]">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold tracking-wider text-sm">MY SERVICE · PLATFORM</span>
          <button onClick={logout} className="text-sm text-mute hover:text-ink">Chiqish</button>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(([key, label, href]) => (
            <Link key={key} href={href} className={`px-3 py-2 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === key ? 'border-ink' : 'border-transparent text-mute'}`}>{label}</Link>
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
            <section className={card + ' lg:col-span-2'}>
              <h2 className="font-semibold mb-3">Servislar</h2>
              <ul className="divide-y">
                {orgs.map(o => <OrgRow key={o.id} org={o} onError={fail} />)}
              </ul>
              {orgs.length === 0 && <p className="text-sm text-mute">Hali servis yo&apos;q</p>}
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
                <div key={p.id} className="p-3 rounded-lg border  text-sm">
                  <p className="font-semibold">{p.name} · {money(p.monthlyPrice)}/oy</p>
                  <p className="text-xs text-mute">Xodim: {p.maxStaff ?? '∞'} · Buyurtma/oy: {p.monthlyOrders ?? '∞'}</p>
                  <p className="text-xs text-mute">{FEATURES.filter(([k]) => p.features?.[k]).map(([, l]) => l).join(' · ') || 'Qo‘shimcha imkoniyat yo‘q'}</p>
                </div>
              ))}
            </section>
            <section className={card}>
              <h2 className="font-semibold mb-3">Yangi tarif</h2>
              <form className="space-y-3" onSubmit={e => submit(e, d => platformApi('/plans', { method: 'POST', body: JSON.stringify({
                name: d.get('name'),
                ...(Number(d.get('maxStaff')) ? { maxStaff: Number(d.get('maxStaff')) } : {}),
                ...(Number(d.get('monthlyOrders')) ? { monthlyOrders: Number(d.get('monthlyOrders')) } : {}),
                monthlyPrice: String(d.get('monthlyPrice') || '0'),
                features: Object.fromEntries(FEATURES.map(([k]) => [k, d.get(k) === 'on'])),
              }) }), 'Tarif yaratildi')}>
                <input name="name" required placeholder="Nomi (START, BUSINESS...)" className={field} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="maxStaff" type="number" min={1} placeholder="Xodim" className={field} />
                  <input name="monthlyOrders" type="number" min={1} placeholder="Buyurtma" className={field} />
                </div>
                <p className="text-[11px] text-mute">Bo&apos;sh qoldirilsa — cheksiz</p>
                <input name="monthlyPrice" required pattern="\d{1,12}(\.\d{1,2})?" placeholder="Oylik narx" defaultValue="0" className={field} />
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  {FEATURES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked className="h-4 w-4" />{l}</label>)}
                </div>
                <button className={button + ' w-full'} disabled={busy}>Tarif yaratish</button>
              </form>
            </section>
          </div>
        )}

        {tab === 'subscriptions' && (
          <section className={card + ' space-y-3'}>
            <h2 className="font-semibold">Obunalar</h2>
            <p className="text-xs text-mute">Muddati tugagan yoki to&apos;xtatilgan servis ma&apos;lumotlarini ko&apos;ra oladi, lekin o&apos;zgartira olmaydi. Ma&apos;lumotlar o&apos;chirilmaydi.</p>
            {orgs.map(o => (
              <form key={o.id + (o.subscription?.expiresAt ?? '')} className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] gap-2 items-center p-3 rounded-lg border "
                onSubmit={e => submit(e, d => platformApi('/organizations/' + o.id + '/subscription', { method: 'PATCH', body: JSON.stringify({ planId: d.get('planId'), status: d.get('status'), expiresAt: new Date(String(d.get('expiresAt')) + 'T23:59:59+05:00').toISOString() }) }), `${o.name}: obuna yangilandi`)}>
                <span className="col-span-2 text-sm md:col-span-1"><b>{o.name}</b><span className="block text-xs text-mute">{o.slug}</span></span>
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
            <BotCard onError={fail} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Database" value={system.database} />
              <Stat label="Faol obunalar" value={system.activeSubscriptions} />
              <Stat label="Navbatdagi eventlar" value={system.pendingOutbox} />
              <Stat label="Xato xabarnomalar" value={system.failedNotifications} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className={card}>
                <h2 className="font-semibold mb-3">Hisob-fakturalar</h2>
                {invoices.length === 0 ? <p className="text-sm text-mute">Hali yo&apos;q</p> : invoices.map(i => <p key={i.id} className="text-sm flex justify-between py-1"><span>{orgName[i.organizationId] ?? i.organizationId}</span><span>{money(i.amount)} · {i.status}</span></p>)}
              </section>
              <section className={card}>
                <h2 className="font-semibold mb-3">Foydalanish</h2>
                {usage.length === 0 ? <p className="text-sm text-mute">Hali yo&apos;q</p> : usage.map(u => <p key={u.id} className="text-sm flex justify-between py-1"><span>{orgName[u.organizationId] ?? u.organizationId} · {u.metric}</span><span>{u.quantity}</span></p>)}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

type Member = { id: string; login: string; firstName: string; lastName?: string | null; phone: string; status: string; mustChangePassword: boolean; roles: { role: { systemKey: string | null } }[] };

/** A service with its people: reset a forgotten password or enter it as its owner to fix a problem. */
function OrgRow({ org, onError }: { org: Org; onError: (e: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Member[] | null>(null);
  const [notice, setNotice] = useState('');
  async function toggle() {
    setOpen(!open);
    if (!users) try { setUsers(await platformApi<Member[]>('/organizations/' + org.id + '/users')); } catch (e) { onError(e); }
  }
  async function support() {
    // Open the tab inside the click, so the browser does not block it as a pop-up.
    const tab = window.open('about:blank', '_blank');
    try {
      const { accessToken, expiresIn } = await platformApi<{ accessToken: string; expiresIn: number }>('/organizations/' + org.id + '/support', { method: 'POST' });
      const url = '/support#token=' + encodeURIComponent(accessToken) + '&expiresIn=' + expiresIn;
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { tab?.close(); onError(e); }
  }
  async function reset(user: Member) {
    const temporaryPassword = window.prompt(`${user.login} uchun yangi vaqtinchalik parol (kamida 12 belgi):`);
    if (!temporaryPassword) return;
    if (temporaryPassword.length < 12) { setNotice('Parol kamida 12 belgi bo‘lishi kerak'); return; }
    try {
      await platformApi('/users/' + user.id + '/reset-password', { method: 'POST', body: JSON.stringify({ temporaryPassword }) });
      setNotice(`${user.login}: parol yangilandi. Birinchi kirishda o‘zi almashtiradi.`);
    } catch (e) { onError(e); }
  }
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={toggle} className="min-w-0 flex-1 text-left">
          <p className="truncate font-semibold">{org.name}</p>
          <p className="truncate text-xs text-mute">{org.slug} · {org.subscription ? `${org.subscription.plan.name}, ${org.subscription.status} ${new Date(org.subscription.expiresAt).toLocaleDateString('ru-RU')} gacha` : 'obunasiz'} · {org._count.users} xodim · {org._count.orders} buyurtma</p>
        </button>
        <button onClick={support} className="h-9 rounded-md border px-3 text-sm font-medium hover:border-ink/40">Servisga kirish</button>
      </div>
      {notice && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {open && (
        <ul className="mt-2 divide-y rounded-md border">
          {!users && <li className="px-3 py-2 text-sm text-mute">Yuklanmoqda…</li>}
          {users?.map(u => (
            <li key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.firstName} <span className="font-mono text-xs text-mute">{u.login}</span>{u.roles.some(r => r.role.systemKey === 'OWNER') ? <span className="text-xs text-mute"> · boshliq</span> : null}{u.status !== 'ACTIVE' ? <span className="text-xs text-red-600"> · {u.status}</span> : null}</span>
              <button onClick={() => reset(u)} className="shrink-0 text-xs font-medium underline">Parolni tiklash</button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

type BotStatus = { configured: boolean; username: string | null; secretSet: boolean; expectedUrl: string | null; webhook: { url: string; pending_update_count: number; last_error_message?: string } | null; adminLinked: boolean; customersLinked: number; staffLinked: number };

/** Telegram bot: what is missing on the server, one-tap webhook setup, and connecting the admin's own chat. */
function BotCard({ onError }: { onError: (e: unknown) => void }) {
  const [bot, setBot] = useState<BotStatus | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => platformApi<BotStatus>('/bot').then(setBot).catch(onError), [onError]);
  useEffect(() => { void load(); }, [load]);
  if (!bot) return null;
  const hookOk = !!bot.webhook?.url && bot.webhook.url === bot.expectedUrl;
  async function setup() {
    setNotice('');
    try { const r = await platformApi<{ url: string }>('/bot/setup', { method: 'POST' }); setNotice('Webhook o‘rnatildi: ' + r.url); await load(); } catch (e) { onError(e); }
  }
  async function polling() {
    setNotice('');
    try { await platformApi('/bot/polling', { method: 'POST' }); setNotice('Webhook o‘chirildi: bir daqiqada bot xabarlarni o‘zi olishni boshlaydi.'); await load(); } catch (e) { onError(e); }
  }
  async function link() {
    const tab = window.open('about:blank', '_blank');
    try { const { url } = await platformApi<{ url: string }>('/bot/link', { method: 'POST' }); if (tab) tab.location.href = url; else window.location.href = url; } catch (e) { tab?.close(); onError(e); }
  }
  const Line = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <p className="flex gap-2 text-sm"><span className={ok ? 'text-emerald-600' : 'text-red-500'}>{ok ? '✓' : '✕'}</span><span>{children}</span></p>;
  return (
    <section className={card + ' space-y-2'}>
      <h2 className="font-semibold">Telegram bot {bot.username && <span className="font-normal text-mute">@{bot.username}</span>}</h2>
      <Line ok={bot.configured && !!bot.username}>Serverda TELEGRAM_BOT_TOKEN va TELEGRAM_BOT_USERNAME {bot.configured && bot.username ? 'bor' : 'yo‘q — @BotFather da bot yarating va .env ga yozing'}</Line>
      <Line ok={bot.secretSet}>TELEGRAM_WEBHOOK_SECRET {bot.secretSet ? 'bor' : 'yo‘q — tasodifiy uzun satr yozing'}</Line>
      {bot.webhook?.url ? (
        <Line ok={hookOk && !bot.webhook.last_error_message}>Webhook: {bot.webhook.url}{bot.webhook.last_error_message ? ' · xato: ' + bot.webhook.last_error_message + ' — «Pollingga o‘tish» ni bosing' : ''}</Line>
      ) : (
        <Line ok={bot.configured}>Polling rejimi: server xabarlarni o‘zi olib turadi (webhook shart emas)</Line>
      )}
      <p className="text-xs text-mute">Ulangan: {bot.customersLinked} mijoz · {bot.staffLinked} xodim</p>
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={setup} disabled={!bot.configured || !bot.secretSet} className={button}>Webhookni o‘rnatish</button>
        {bot.webhook?.url && <button onClick={polling} className="h-11 sm:h-10 px-4 rounded-md border text-sm font-semibold">Pollingga o‘tish</button>}
        <button onClick={link} disabled={!bot.configured || !bot.username} className="h-11 sm:h-10 px-4 rounded-md border text-sm font-semibold disabled:opacity-50">{bot.adminLinked ? 'Telegram ulangan · qayta ulash' : 'Telegramimni ulash'}</button>
      </div>
    </section>
  );
}
