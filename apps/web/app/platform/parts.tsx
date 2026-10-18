'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { platformApi } from './lib';

export const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + " so'm";
export const field = 'w-full h-11 sm:h-10 rounded-md border border-line bg-white px-3 text-base sm:text-sm focus:border-ink focus:outline-none';
export const card = 'rounded-lg border bg-white p-4 sm:p-5';
export const button = 'h-11 sm:h-10 px-4 rounded-md bg-ink text-white text-sm font-semibold disabled:opacity-50';
export const ghost = 'h-11 sm:h-10 px-4 rounded-md border text-sm font-semibold disabled:opacity-50 hover:border-ink/40';
const day = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString('ru-RU') : '—';
const when = (v: string | null | undefined) => v ? new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export type OrgState = 'blocked' | 'trial' | 'active' | 'expired';
export const STATE: Record<OrgState, [string, string]> = {
  trial: ['Sinov', 'text-st-tamir-ink'], active: ['Faol', 'text-st-tayyor-ink'], expired: ['Tugagan', 'text-st-kutish-ink'], blocked: ['Bloklangan', 'text-red-700'],
};
export function StateStamp({ state }: { state: OrgState }) {
  const [label, color] = STATE[state];
  return <span className={`inline-flex shrink-0 rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${color}`}>{label}</span>;
}

/** Shared state for console actions: busy flag, notice, error, and SESSION_EXPIRED → login. */
export function useConsoleAction(onSessionExpired: () => void) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const fail = useCallback((e: unknown) => {
    if (e instanceof Error && e.message === 'SESSION_EXPIRED') onSessionExpired();
    else setError(e instanceof Error ? e.message : 'Xato');
  }, [onSessionExpired]);
  const run = useCallback(async (action: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(done); } catch (err) { fail(err); } finally { setBusy(false); }
  }, [fail]);
  return { busy, notice, error, fail, run };
}
export function Messages({ notice, error }: { notice: string; error: string }) {
  return <>
    {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</p>}
    {notice && <p role="status" className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{notice}</p>}
  </>;
}

// ---------- Services list with search and filter ----------

export type OrgListItem = { id: string; name: string; slug: string; createdAt: string; state: OrgState; owner: { firstName: string; phone: string; login: string } | null;
  _count: { users: number; branches: number; orders: number }; subscription: { status: string; expiresAt: string; plan: { name: string } } | null };

export function OrgList({ onError, limit }: { onError: (e: unknown) => void; limit?: number }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState<OrgState | ''>('');
  const [rows, setRows] = useState<OrgListItem[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(state ? { state } : {}) });
      platformApi<OrgListItem[]>('/organizations' + (params.size ? '?' + params : '')).then(setRows).catch(onError);
    }, 250);
    return () => clearTimeout(t);
  }, [q, state, onError]);
  const shown = limit ? rows?.slice(0, limit) : rows;
  return (
    <section className={card + ' space-y-3'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Servislar {rows && <span className="font-normal text-mute">· {rows.length}</span>}</h2>
        {limit && <Link href="/platform/organizations" className="text-sm text-mute underline">Hammasi</Link>}
      </div>
      {!limit && (
        <>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Nomi, login yoki telefon" className={field} type="search" aria-label="Servislardan qidirish" />
          <div className="flex flex-wrap gap-1.5">
            {([['', 'Hammasi'], ['trial', 'Sinovda'], ['active', 'Faol'], ['expired', 'Tugagan'], ['blocked', 'Bloklangan']] as const).map(([k, l]) => (
              <button key={k} className="chip" aria-pressed={state === k} onClick={() => setState(k)}>{l}</button>
            ))}
          </div>
        </>
      )}
      {!rows ? <p className="text-sm text-mute">Yuklanmoqda…</p> : rows.length === 0 ? <p className="text-sm text-mute">Topilmadi</p> : (
        <ul className="divide-y">
          {shown!.map(o => (
            <li key={o.id}>
              <Link href={'/platform/organizations/' + o.id} className="flex items-center gap-3 py-3 hover:bg-paper">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{o.name}</p>
                  <p className="truncate text-xs text-mute">{o.owner ? `${o.owner.firstName} · ${o.owner.phone} · ` : ''}{o.subscription ? `${o.subscription.plan.name}, ${day(o.subscription.expiresAt)} gacha` : 'obunasiz'} · {o._count.orders} buyurtma</p>
                </div>
                <StateStamp state={o.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- One service ----------

type Member = { id: string; login: string; firstName: string; lastName?: string | null; phone: string; status: string; mustChangePassword: boolean; telegram: boolean; roles: { role: { systemKey: string | null } }[] };
type OrgDetailData = {
  id: string; name: string; slug: string; createdAt: string; blockedAt: string | null; blockReason: string | null; platformNote: string | null; state: OrgState;
  subscription: { status: string; expiresAt: string; graceUntil: string | null; billingPeriod: string; plan: { id: string; name: string; monthlyPrice: string } } | null;
  nextPlan: { id: string; name: string } | null; users: Member[];
  stats: { orders: number; ordersMonth: number; customers: number; failedNotifications30d: number; lastLoginAt: string | null };
  setup: { steps: { key: string; done: boolean }[]; done: number; total: number } | null;
  audit: { action: string; actorId: string | null; createdAt: string }[];
  tickets: { id: string; subject: string; status: string; updatedAt: string }[];
};
const STEP: Record<string, string> = { profile: "Ma'lumotlar", logo: 'Logotip', warranty: 'Kafolat', telegram: 'Telegram', staff: 'Xodim', order: 'Birinchi qabul' };

export function OrgDetail({ id, onSessionExpired }: { id: string; onSessionExpired: () => void }) {
  const { busy, notice, error, fail, run } = useConsoleAction(onSessionExpired);
  const [org, setOrg] = useState<OrgDetailData | null>(null);
  const load = useCallback(() => platformApi<OrgDetailData>('/organizations/' + id).then(setOrg).catch(fail), [id, fail]);
  useEffect(() => { void load(); }, [load]);
  if (!org) return <><Messages notice={notice} error={error} /><p className="text-sm text-mute">Yuklanmoqda…</p></>;
  const act = (action: () => Promise<unknown>, done: string) => run(async () => { await action(); await load(); }, done);

  async function support() {
    const tab = window.open('about:blank', '_blank');
    try {
      const { accessToken, expiresIn } = await platformApi<{ accessToken: string; expiresIn: number }>('/organizations/' + id + '/support', { method: 'POST' });
      const url = '/support#token=' + encodeURIComponent(accessToken) + '&expiresIn=' + expiresIn;
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (e) { tab?.close(); fail(e); }
  }
  async function reset(user: Member) {
    const temporaryPassword = window.prompt(`${user.login} uchun yangi vaqtinchalik parol (kamida 12 belgi):`);
    if (!temporaryPassword) return;
    if (temporaryPassword.length < 12) return fail(new Error('Parol kamida 12 belgi bo‘lishi kerak'));
    await act(() => platformApi('/users/' + user.id + '/reset-password', { method: 'POST', body: JSON.stringify({ temporaryPassword }) }), `${user.login}: parol yangilandi. Birinchi kirishda o‘zi almashtiradi.`);
  }
  const s = org.subscription;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/platform/organizations" className="text-sm text-mute underline">← Servislar</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-sm text-mute">{org.slug} · ochilgan {day(org.createdAt)} · oxirgi kirish {when(org.stats.lastLoginAt)}</p>
        </div>
        <div className="flex items-center gap-2"><StateStamp state={org.state} /><button onClick={support} className={ghost}>Servisga kirish</button></div>
      </div>
      <Messages notice={notice} error={error} />
      {org.blockedAt && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Bloklangan {day(org.blockedAt)}: {org.blockReason}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Buyurtmalar', org.stats.orders], ['Shu oy', org.stats.ordersMonth], ['Mijozlar', org.stats.customers], ['Xato xabarlar (30 kun)', org.stats.failedNotifications30d]] as const).map(([l, v]) => (
          <div key={l} className={card}><p className="eyebrow">{l}</p><p className="num mt-1 font-mono text-xl font-semibold">{v}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card + ' space-y-3'}>
          <h2 className="font-semibold">Obuna</h2>
          {s ? (
            <div className="space-y-1 text-sm">
              <p><b>{s.plan.name}</b> · {money(s.plan.monthlyPrice)}/oy · {s.status}</p>
              <p className="text-mute">Tugaydi: {day(s.expiresAt)}{s.graceUntil ? ` · ko'rish rejimi: ${day(s.graceUntil)}` : ''}</p>
              {org.nextPlan && <p className="text-mute">Tanlagan: <b className="text-ink">{org.nextPlan.name}</b>, {s.billingPeriod === 'YEAR' ? 'yillik' : 'oylik'}</p>}
            </div>
          ) : <p className="text-sm text-mute">Obuna yo&apos;q</p>}
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); void act(() => platformApi('/organizations/' + id + '/extend', { method: 'POST', body: JSON.stringify({ days: Number(d.get('days')), status: d.get('status') }) }), `${d.get('days')} kun qo'shildi`); }}>
            <label className="block space-y-1 text-sm"><span className="font-medium">Kun qo&apos;shish</span><input name="days" type="number" min={1} max={365} defaultValue={14} required className={field + ' w-28'} /></label>
            <label className="block space-y-1 text-sm"><span className="font-medium">Holat</span><select name="status" defaultValue={s?.status === 'ACTIVE' ? 'ACTIVE' : 'TRIAL'} className={field + ' w-32'}><option value="TRIAL">Sinov</option><option value="ACTIVE">Faol</option></select></label>
            <button className={button} disabled={busy}>Uzaytirish</button>
          </form>
          <p className="text-xs text-mute">Tarif va aniq sanani «Obunalar» bo&apos;limida o&apos;zgartirasiz.</p>
        </section>

        <section className={card + ' space-y-3'}>
          <h2 className="font-semibold">Sozlash {org.setup && <span className="font-normal text-mute">· {org.setup.done}/{org.setup.total}</span>}</h2>
          <div className="flex flex-wrap gap-1.5">
            {org.setup?.steps.map(x => <span key={x.key} className={`rounded-full border px-2.5 py-1 text-xs ${x.done ? 'border-st-tayyor bg-emerald-50 text-emerald-800' : 'text-mute'}`}>{x.done ? '✓ ' : ''}{STEP[x.key] ?? x.key}</span>)}
          </div>
          <h2 className="pt-2 font-semibold">Ichki izoh</h2>
          <form key={org.platformNote ?? ''} className="space-y-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); void act(() => platformApi('/organizations/' + id + '/note', { method: 'PUT', body: JSON.stringify({ note: String(d.get('note') ?? '') }) }), 'Izoh saqlandi'); }}>
            <textarea name="note" defaultValue={org.platformNote ?? ''} rows={3} maxLength={2000} placeholder="Faqat sizga ko'rinadi: kelishuvlar, qo'ng'iroqlar…" className="w-full rounded-md border border-line bg-white p-3 text-sm focus:border-ink focus:outline-none" />
            <button className={ghost} disabled={busy}>Saqlash</button>
          </form>
        </section>
      </div>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Xodimlar</h2>
        <ul className="divide-y">
          {org.users.map(u => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{u.firstName} <span className="font-mono text-xs text-mute">{u.login}</span> · {u.phone}{u.roles.some(r => r.role.systemKey === 'OWNER') ? <span className="text-xs text-mute"> · boshliq</span> : null}{u.telegram ? <span className="text-xs text-mute"> · Telegram</span> : null}{u.status !== 'ACTIVE' ? <span className="text-xs text-red-600"> · {u.status}</span> : null}</span>
              <button onClick={() => reset(u)} className="shrink-0 text-xs font-medium underline">Parolni tiklash</button>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-2 font-semibold">Murojaatlar</h2>
          {org.tickets.length === 0 ? <p className="text-sm text-mute">Yo&apos;q</p> : (
            <ul className="divide-y">{org.tickets.map(t => <li key={t.id}><Link href={'/platform/tickets?open=' + t.id} className="flex justify-between gap-2 py-2 text-sm hover:underline"><span className="truncate">{t.subject}</span><span className="shrink-0 text-xs text-mute">{t.status} · {when(t.updatedAt)}</span></Link></li>)}</ul>
          )}
        </section>
        <section className={card}>
          <h2 className="mb-2 font-semibold">So&apos;nggi harakatlar</h2>
          <ul className="space-y-1 text-xs">{org.audit.map((x, i) => <li key={i} className="flex justify-between gap-2"><span className="font-mono">{x.action}{x.actorId?.startsWith('platform:') ? ' · platforma' : ''}</span><span className="text-mute">{when(x.createdAt)}</span></li>)}</ul>
        </section>
      </div>

      <section className={card + ' space-y-2'}>
        <h2 className="font-semibold">{org.blockedAt ? 'Blokdan chiqarish' : 'Bloklash'}</h2>
        {org.blockedAt ? (
          <button className={button} disabled={busy} onClick={() => act(() => platformApi('/organizations/' + id + '/unblock', { method: 'POST' }), 'Servis blokdan chiqarildi')}>Blokdan chiqarish</button>
        ) : (
          <form className="flex flex-wrap gap-2" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const d = new FormData(e.currentTarget); if (!window.confirm(`${org.name} bloklansinmi? Servis faqat «Hisobim» va «Yordam» ni ko'radi.`)) return; void act(() => platformApi('/organizations/' + id + '/block', { method: 'POST', body: JSON.stringify({ reason: String(d.get('reason') ?? '') }) }), 'Servis bloklandi'); }}>
            <input name="reason" required maxLength={300} placeholder="Sabab (servisga ko'rinadi)" className={field + ' min-w-0 flex-1'} />
            <button className="h-11 rounded-md bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:h-10" disabled={busy}>Bloklash</button>
          </form>
        )}
        <p className="text-xs text-mute">Bloklangan servis tizimga kiradi, lekin faqat «Hisobim» va «Yordam» ishlaydi. Ma&apos;lumotlar o&apos;chmaydi.</p>
      </section>
    </div>
  );
}

// ---------- Support inbox ----------

type TicketRow = { id: string; subject: string; status: 'OPEN' | 'ANSWERED' | 'CLOSED'; updatedAt: string; organization: { id: string; name: string }; last: { author: string; body: string } | null; messages: number };
type TicketFull = TicketRow & { author: { firstName: string; phone: string; login: string } | null; messages: { id: string; author: string; authorName: string; body: string; createdAt: string }[] };
const TICKET: Record<string, string> = { OPEN: 'Javob kutmoqda', ANSWERED: 'Javob berilgan', CLOSED: 'Yopilgan' };

export function TicketsTab({ onError, initial }: { onError: (e: unknown) => void; initial?: string | null }) {
  const [status, setStatus] = useState<'OPEN' | 'ANSWERED' | 'CLOSED' | ''>('OPEN');
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(initial ?? null);
  const load = useCallback(() => platformApi<TicketRow[]>('/tickets' + (status ? '?status=' + status : '')).then(setRows).catch(onError), [status, onError]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <section className={card + ' space-y-3 lg:col-span-2'}>
        <h2 className="font-semibold">Murojaatlar</h2>
        <div className="flex flex-wrap gap-1.5">
          {([['OPEN', 'Kutmoqda'], ['ANSWERED', 'Javob berilgan'], ['CLOSED', 'Yopilgan'], ['', 'Hammasi']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        {!rows ? <p className="text-sm text-mute">Yuklanmoqda…</p> : rows.length === 0 ? <p className="text-sm text-mute">Murojaat yo&apos;q</p> : (
          <ul className="divide-y">
            {rows.map(t => (
              <li key={t.id}>
                <button onClick={() => setOpen(t.id)} className={`block w-full py-2.5 text-left ${open === t.id ? 'bg-paper' : ''}`}>
                  <p className="truncate text-sm font-semibold">{t.subject}</p>
                  <p className="truncate text-xs text-mute">{t.organization.name} · {when(t.updatedAt)} · {TICKET[t.status]}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="lg:col-span-3">{open ? <TicketThread key={open} id={open} onError={onError} onChange={load} /> : <p className="text-sm text-mute">Chapdan murojaatni tanlang.</p>}</div>
    </div>
  );
}

function TicketThread({ id, onError, onChange }: { id: string; onError: (e: unknown) => void; onChange: () => void }) {
  const [t, setT] = useState<TicketFull | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => platformApi<TicketFull>('/tickets/' + id).then(setT).catch(onError), [id, onError]);
  useEffect(() => { void load(); }, [load]);
  if (!t) return <p className="text-sm text-mute">Yuklanmoqda…</p>;
  async function act(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await load(); onChange(); } catch (e) { onError(e); } finally { setBusy(false); } }
  return (
    <section className={card + ' space-y-3'}>
      <div>
        <h2 className="font-semibold">{t.subject}</h2>
        <p className="text-xs text-mute"><Link href={'/platform/organizations/' + t.organization.id} className="underline">{t.organization.name}</Link>{t.author ? ` · ${t.author.firstName} (${t.author.login}, ${t.author.phone})` : ''} · {TICKET[t.status]}</p>
      </div>
      <ol className="space-y-2">
        {t.messages.map(m => (
          <li key={m.id} className={`rounded-lg p-3 text-sm ${m.author === 'PLATFORM' ? 'ml-8 bg-ink text-white' : 'mr-8 bg-paper'}`}>
            <p className={`text-xs font-semibold ${m.author === 'PLATFORM' ? 'text-white/70' : 'text-mute'}`}>{m.authorName} · {when(m.createdAt)}</p>
            <p className="mt-1 whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ol>
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (!body.trim()) return; void act(async () => { await platformApi('/tickets/' + id + '/messages', { method: 'POST', body: JSON.stringify({ body: body.trim() }) }); setBody(''); }); }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="Javob (servisga ilovada va Telegramda boradi)" className="w-full rounded-md border border-line bg-white p-3 text-sm focus:border-ink focus:outline-none" />
        <div className="flex gap-2">
          <button className={button} disabled={busy || !body.trim()}>Javob yuborish</button>
          {t.status !== 'CLOSED' && <button type="button" className={ghost} disabled={busy} onClick={() => act(() => platformApi('/tickets/' + id + '/close', { method: 'POST' }))}>Yopish</button>}
        </div>
      </form>
    </section>
  );
}

// ---------- Announcements ----------

type Announcement = { id: string; title: string; body: string; level: 'INFO' | 'WARNING'; active: boolean; createdAt: string };
export function AnnouncementsTab({ onError }: { onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => platformApi<Announcement[]>('/announcements').then(setRows).catch(onError), [onError]);
  useEffect(() => { void load(); }, [load]);
  async function act(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await load(); } catch (e) { onError(e); } finally { setBusy(false); } }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className={card + ' space-y-3 lg:col-span-2'}>
        <h2 className="font-semibold">E&apos;lonlar</h2>
        <p className="text-xs text-mute">Faol e&apos;lon hamma servislarning ilovasida tepada chiqadi (har kim o&apos;zida yopishi mumkin).</p>
        {!rows ? <p className="text-sm text-mute">Yuklanmoqda…</p> : rows.length === 0 ? <p className="text-sm text-mute">Hali e&apos;lon yo&apos;q</p> : rows.map(a => (
          <div key={a.id} className={`rounded-lg border p-3 text-sm ${a.active ? '' : 'bg-paper text-mute'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{a.level === 'WARNING' ? '⚠️ ' : ''}{a.title}</p>
              <button className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold" disabled={busy} onClick={() => act(() => platformApi('/announcements/' + a.id, { method: 'PATCH', body: JSON.stringify({ active: !a.active }) }))}>{a.active ? 'O‘chirish' : 'Yoqish'}</button>
            </div>
            <p className="mt-1 whitespace-pre-line">{a.body}</p>
            <p className="mt-1 text-xs text-mute">{when(a.createdAt)} · {a.active ? 'faol' : 'o‘chirilgan'}</p>
          </div>
        ))}
      </section>
      <section className={card}>
        <h2 className="mb-3 font-semibold">Yangi e&apos;lon</h2>
        <form className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); void act(async () => { await platformApi('/announcements', { method: 'POST', body: JSON.stringify({ title: d.get('title'), body: d.get('body'), level: d.get('level') }) }); form.reset(); }); }}>
          <input name="title" required maxLength={120} placeholder="Sarlavha" className={field} />
          <textarea name="body" required maxLength={2000} rows={4} placeholder="Matn" className="w-full rounded-md border border-line bg-white p-3 text-sm focus:border-ink focus:outline-none" />
          <select name="level" className={field} defaultValue="INFO"><option value="INFO">Ma&apos;lumot</option><option value="WARNING">Ogohlantirish</option></select>
          <button className={button + ' w-full'} disabled={busy}>E&apos;lon qilish</button>
        </form>
      </section>
    </div>
  );
}

// ---------- Two-factor sign-in ----------

export function TwoFactorCard({ onError }: { onError: (e: unknown) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { platformApi<{ enabled: boolean }>('/auth/two-factor').then(r => setEnabled(r.enabled)).catch(onError); }, [onError]);
  if (enabled === null) return null;
  async function start() { try { setSetup(await platformApi<{ secret: string; qr: string }>('/auth/two-factor/setup', { method: 'POST' })); } catch (e) { onError(e); } }
  async function confirm(path: 'enable' | 'disable') {
    try { const r = await platformApi<{ enabled: boolean }>('/auth/two-factor/' + path, { method: 'POST', body: JSON.stringify({ code }) }); setEnabled(r.enabled); setSetup(null); setCode(''); setNotice(r.enabled ? 'Yoqildi: endi kirishda ilovadagi kod so‘raladi.' : 'O‘chirildi.'); }
    catch (e) { onError(e instanceof Error && e.message === 'TOTP_INVALID' ? new Error("Kod noto'g'ri. Ilovadagi yangi kodni yozing.") : e); }
  }
  const codeInput = <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 xonali kod" className={field + ' w-40 font-mono tracking-[0.3em]'} aria-label="Kod" />;
  return (
    <section className={card + ' space-y-3'}>
      <h2 className="font-semibold">Ikki bosqichli kirish (2FA)</h2>
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {enabled ? (
        <>
          <p className="text-sm">✓ Yoqilgan. Kirishda parol va Google Authenticator kodi so&apos;raladi.</p>
          <div className="flex flex-wrap gap-2">{codeInput}<button className={ghost} disabled={code.length !== 6} onClick={() => confirm('disable')}>O&apos;chirish</button></div>
        </>
      ) : setup ? (
        <div className="space-y-3 text-sm">
          <p>1. Telefoningizda <b>Google Authenticator</b> (yoki Microsoft Authenticator) ni oching va QR kodni skanerlang:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="2FA QR kod" className="h-44 w-44 rounded-md border" />
          <p className="text-xs text-mute">Skaner ishlamasa, kalitni qo&apos;lda kiriting: <code className="font-mono break-all">{setup.secret}</code></p>
          <p>2. Ilova ko&apos;rsatgan 6 xonali kodni yozing:</p>
          <div className="flex flex-wrap gap-2">{codeInput}<button className={button} disabled={code.length !== 6} onClick={() => confirm('enable')}>Yoqish</button></div>
        </div>
      ) : (
        <>
          <p className="text-sm text-mute">Parol o&apos;g&apos;irlansa ham, telefoningizdagi kod bo&apos;lmasa hech kim platformaga kira olmaydi. Platforma hamma servislarni boshqaradi — yoqishni tavsiya qilamiz.</p>
          <button className={button} onClick={start}>Yoqish</button>
        </>
      )}
    </section>
  );
}

// ---------- Monitoring ----------

type MonitorState = { at: string | null; checks: { key: string; ok: boolean; detail: string }[] };
const CHECK: Record<string, string> = { database: "Ma'lumotlar bazasi", redis: 'Redis', outbox: 'Xabarlar navbati', failed: 'Yuborilmagan xabarlar (1 soat)', sms: 'Platforma SMS balansi' };
export function MonitorCard({ onError }: { onError: (e: unknown) => void }) {
  const [m, setM] = useState<MonitorState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback((run = false) => { setBusy(true); return platformApi<MonitorState>('/monitor' + (run ? '?run=1' : '')).then(setM).catch(onError).finally(() => setBusy(false)); }, [onError]);
  useEffect(() => { void load(); }, [load]);
  return (
    <section className={card + ' space-y-2'}>
      <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Monitoring</h2><button className={ghost} disabled={busy} onClick={() => load(true)}>Hozir tekshirish</button></div>
      <p className="text-xs text-mute">Har 5 daqiqada tekshiriladi. Biror narsa buzilsa yoki tiklansa, Telegramingizga xabar keladi (Telegramingiz ulangan bo&apos;lishi kerak).{m?.at ? ` Oxirgi: ${when(m.at)}` : ''}</p>
      {m?.checks.length ? m.checks.map(c => <p key={c.key} className="flex gap-2 text-sm"><span className={c.ok ? 'text-emerald-600' : 'text-red-500'}>{c.ok ? '✓' : '✕'}</span><span>{CHECK[c.key] ?? c.key}: {c.detail}</span></p>) : <p className="text-sm text-mute">Hali tekshirilmagan.</p>}
      <p className="text-xs text-mute">Tashqi kuzatuv uchun UptimeRobot kabi xizmatda <code className="font-mono">/api/health</code> manzilini qo&apos;shing — server butunlay o&apos;chsa ham xabar beradi.</p>
    </section>
  );
}

// ---------- Company details for the legal pages ----------

const LEGAL: [string, string, string][] = [
  ['company', 'Kompaniya nomi', 'MChJ "MyService"'], ['inn', 'STIR', '123456789'], ['address', 'Yuridik manzil', 'Toshkent sh., …'],
  ['phone', 'Telefon', '+998 90 000 00 00'], ['email', 'Email', 'info@myserviceuz.uz'], ['dataLocation', 'Serverlar joylashuvi', "Toshkent, O'zbekiston"],
];
export function LegalCard({ onError }: { onError: (e: unknown) => void }) {
  const [v, setV] = useState<Record<string, string> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { platformApi<Record<string, string>>('/legal').then(setV).catch(onError); }, [onError]);
  if (!v) return null;
  return (
    <section className={card + ' space-y-3'}>
      <h2 className="font-semibold">Huquqiy sahifalar uchun rekvizitlar</h2>
      <p className="text-xs text-mute"><a href="/terms" target="_blank" className="underline">Ommaviy oferta</a> va <a href="/privacy" target="_blank" className="underline">maxfiylik siyosati</a> sahifalarida chiqadi. Bo&apos;sh maydon [ … ] ko&apos;rinishida qoladi. Matnni yurist bilan ko&apos;rib chiqing.</p>
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault(); const d = new FormData(e.currentTarget);
        platformApi<Record<string, string>>('/legal', { method: 'PUT', body: JSON.stringify(Object.fromEntries(LEGAL.map(([k]) => [k, String(d.get(k) ?? '')]))) }).then(r => { setV(r); setNotice('Saqlandi'); }).catch(onError);
      }}>
        {LEGAL.map(([k, l, ph]) => <label key={k} className="block space-y-1 text-sm"><span className="font-medium">{l}</span><input name={k} defaultValue={v[k] ?? ''} placeholder={ph} className={field} /></label>)}
        <button className={button + ' sm:col-span-2 sm:w-fit'}>Saqlash</button>
      </form>
    </section>
  );
}
