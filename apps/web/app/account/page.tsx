'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { date, money, som } from '../../lib/format';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { ErrorBox, Loading, Notice } from '../../components/ui/feedback';
import { SupportLink } from '../../components/setup-steps';

type Plan = { id: string; name: string; description: string | null; monthlyPrice: string; yearlyTotal: string; maxStaff: number | null; maxBranches: number | null; monthlyOrders: number | null; smsPerMonth: number | null; features: Record<string, boolean>; available: boolean };
type Account = {
  organization: { name: string; createdAt: string; blocked: { at: string; reason: string | null } | null };
  subscription: { status: string; expiresAt: string; graceUntil: string | null; daysLeft: number; inGrace: boolean; readOnly: boolean; plan: Plan; nextPlanId: string | null; billingPeriod: 'MONTH' | 'YEAR' } | null;
  usage: { month: string; orders: number; ordersLimit: number | null; sms: number; smsLimit: number | null; smsExtra: number; smsExtraCost: string; smsOwnAccount: boolean; staff: number; staffLimit: number | null; branches: number; branchesLimit: number | null };
  plans: Plan[];
  billing: { extraSmsPrice: string; yearlyFreeMonths: number };
  invoices: { id: string; amount: string; status: string; issuedAt: string; dueAt: string }[];
};

const FEATURE_TEXT: [string, string][] = [['telegram', 'Telegram xabarlar'], ['sms', 'SMS xabarlar'], ['exports', 'Eksport (CSV, PDF)'], ['own_bot', "O'z Telegram boti"]];
const limitText = (n: number | null, unit: string) => n === null ? `Cheksiz ${unit}` : `${n} ta ${unit}`;
const INVOICE: Record<string, string> = { PAID: "To'langan", PENDING: 'Kutilmoqda', OVERDUE: "Muddati o'tgan", CANCELLED: 'Bekor' };

function statusOf(a: Account) {
  const s = a.subscription;
  if (a.organization.blocked) return { label: "To'xtatilgan", tone: 'text-red-300' };
  if (!s) return { label: 'Obuna yo‘q', tone: 'text-red-300' };
  if (s.readOnly) return { label: 'Muddati tugagan', tone: 'text-[#FFB547]' };
  if (s.inGrace) return { label: 'Imtiyozli davr', tone: 'text-[#FFB547]' };
  return s.status === 'TRIAL' ? { label: 'Tekin sinov', tone: 'text-[#5BE39A]' } : { label: 'Faol', tone: 'text-[#5BE39A]' };
}

/** Hisobim: plan and how long it runs, this month's usage against the limits, plans to choose, payments. */
export default function AccountPage() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({ queryKey: ['account'], queryFn: () => api<Account>('/account') });
  const [period, setPeriod] = useState<'MONTH' | 'YEAR' | null>(null);
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <AppShell title="Hisobim" narrow><ErrorBox>{errorText(error)}</ErrorBox></AppShell>;
  if (isLoading || !data) return <AppShell title="Hisobim" narrow><Loading rows={4} /></AppShell>;
  const sub = data.subscription;
  const shownPeriod = period ?? sub?.billingPeriod ?? 'MONTH';
  const status = statusOf(data);

  async function choose(plan: Plan) {
    setBusy(plan.id); setState({});
    try {
      const r = await api<{ amount: string }>('/account/plan', { method: 'PUT', body: JSON.stringify({ planId: plan.id, period: shownPeriod }) });
      await qc.invalidateQueries({ queryKey: ['account'] });
      setState({ ok: `«${plan.name}» tanlandi: ${som(r.amount)} ${shownPeriod === 'YEAR' ? 'yiliga' : 'oyiga'}. Keyingi to‘lovda shu tarif ulanadi.` });
    } catch (e) { setState({ error: errorText(e) }); } finally { setBusy(null); }
  }

  return (
    <AppShell title="Hisobim" narrow>
      <div className="space-y-4">
        {/* Plan and time left */}
        <section className="talon-dark on-ink overflow-hidden">
          <div className="p-5 sm:p-6">
            <div className="flex justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/60"><span className="truncate">{data.organization.name}</span><span className={status.tone}>{status.label}</span></div>
            <p className="mt-2 text-2xl font-bold tracking-tight">{sub ? sub.plan.name : '—'}</p>
            {sub && !data.organization.blocked && (
              <p className="mt-1 flex items-baseline gap-2">
                <span className="num font-mono text-[2.75rem] font-semibold leading-none tracking-tight">{sub.daysLeft}</span>
                <span className="text-base font-medium">kun qoldi</span>
              </p>
            )}
            {data.organization.blocked && <p className="mt-2 text-sm text-white/80">{data.organization.blocked.reason ?? "Yordam bo'limiga yozing."}</p>}
          </div>
          {sub && (
            <>
              <div className="talon-cut" />
              <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-4 text-sm sm:px-6">
                <div><p className="text-xs text-white/60">{sub.status === 'TRIAL' ? 'Sinov tugaydi' : 'Obuna tugaydi'}</p><p className="num mt-0.5 font-mono font-semibold">{date(sub.expiresAt)}</p></div>
                {sub.graceUntil && <div><p className="text-xs text-white/60">Ko&apos;rish rejimiga o&apos;tadi</p><p className="num mt-0.5 font-mono font-semibold">{date(sub.graceUntil)}</p></div>}
              </div>
            </>
          )}
        </section>
        {sub?.readOnly && <ErrorBox>Obuna muddati tugagan: ma&apos;lumotlarni ko&apos;rish mumkin, yangi buyurtma yozib bo&apos;lmaydi. Quyida tarif tanlab, to&apos;lovni amalga oshiring.</ErrorBox>}

        {/* This month against the plan's limits */}
        <section className="rounded-2xl border bg-white p-4 sm:p-5">
          <div className="flex items-baseline justify-between"><h2 className="font-bold">Shu oy</h2><span className="num font-mono text-xs text-mute">{data.usage.month}</span></div>
          <div className="mt-3 space-y-3">
            <Usage label="Buyurtmalar" used={data.usage.orders} limit={data.usage.ordersLimit} />
            {data.usage.smsOwnAccount
              ? <div className="flex items-baseline justify-between text-sm"><span className="font-medium">SMS</span><span className="text-xs text-mute">o&apos;z Eskiz akkauntingizdan</span></div>
              : <Usage label="SMS" used={data.usage.sms} limit={data.usage.smsLimit} hint={data.usage.smsExtra > 0 ? `${data.usage.smsExtra} ta ortiqcha × ${som(data.billing.extraSmsPrice)} = ${som(data.usage.smsExtraCost)} (keyingi to'lovga qo'shiladi)` : data.usage.smsLimit !== null ? `Ortig'i — ${som(data.billing.extraSmsPrice)} dan` : undefined} />}
            <Usage label="Xodimlar" used={data.usage.staff} limit={data.usage.staffLimit} />
            <Usage label="Filiallar" used={data.usage.branches} limit={data.usage.branchesLimit} />
          </div>
        </section>

        {/* Plans */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">Tariflar</h2>
            <div className="flex rounded-full border bg-white p-0.5 text-sm" role="radiogroup" aria-label="To'lov davri">
              {(['MONTH', 'YEAR'] as const).map(p => (
                <button key={p} role="radio" aria-checked={shownPeriod === p} onClick={() => setPeriod(p)}
                  className={cn('h-9 rounded-full px-3.5 font-medium', shownPeriod === p ? 'bg-ink text-white' : 'text-mute')}>
                  {p === 'MONTH' ? 'Oylik' : `Yillik${data.billing.yearlyFreeMonths ? ` · ${data.billing.yearlyFreeMonths} oy bepul` : ''}`}
                </button>
              ))}
            </div>
          </div>
          <Notice>{state.ok}</Notice><ErrorBox>{state.error}</ErrorBox>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.plans.map(p => {
              const current = sub?.plan.id === p.id;
              const chosen = sub?.nextPlanId === p.id && sub.billingPeriod === shownPeriod;
              const price = shownPeriod === 'YEAR' ? p.yearlyTotal : p.monthlyPrice;
              return (
                <div key={p.id} className={cn('flex flex-col rounded-2xl border bg-white p-4', chosen && 'border-ink ring-1 ring-ink')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-bold">{p.name}</p>{p.description && <p className="text-xs text-mute">{p.description}</p>}</div>
                    {current && <span className="shrink-0 rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-st-tayyor-ink">Hozirgi</span>}
                  </div>
                  <p className="num mt-3 font-mono text-2xl font-semibold tracking-tight">{money(price)}<span className="font-sans text-xs font-normal text-mute"> so&apos;m / {shownPeriod === 'YEAR' ? 'yil' : 'oy'}</span></p>
                  {shownPeriod === 'YEAR' && <p className="text-xs text-mute">oyiga {money(Math.round(Number(p.yearlyTotal) / 12))} so&apos;m</p>}
                  <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                    {[limitText(p.maxStaff, 'xodim'), limitText(p.maxBranches, 'filial'), p.monthlyOrders === null ? 'Cheksiz buyurtma' : `Oyiga ${p.monthlyOrders} ta buyurtma`, p.smsPerMonth === null ? 'Cheksiz SMS' : `Oyiga ${p.smsPerMonth} ta SMS`,
                      ...FEATURE_TEXT.filter(([k]) => p.features?.[k]).map(([, t]) => t)].map(t => (
                      <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-st-tayyor" />{t}</li>
                    ))}
                  </ul>
                  {p.available ? (
                    <Button className="mt-4 w-full" variant={chosen ? 'secondary' : 'brand'} disabled={!!busy || chosen} onClick={() => choose(p)}>
                      {chosen ? 'Tanlangan' : busy === p.id ? 'Saqlanmoqda…' : current ? 'Shu tarifda davom etish' : 'Shu tarifni tanlash'}
                    </Button>
                  ) : <p className="mt-4 text-center text-xs text-mute">Bu tarif endi taklif qilinmaydi — boshqasini tanlang.</p>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-mute">Tanlangan tarif keyingi to&apos;lovdan boshlab ulanadi. Click va Payme orqali to&apos;lov tez orada qo&apos;shiladi; hozircha to&apos;lash uchun <Link href="/help" className="underline">yordam bo&apos;limiga</Link> yozing.</p>
        </section>

        {/* Payments */}
        <section className="rounded-2xl border bg-white p-4 sm:p-5">
          <h2 className="font-bold">To&apos;lovlar</h2>
          {data.invoices.length === 0 ? <p className="mt-2 text-sm text-mute">Hali to&apos;lov yo&apos;q.</p> : (
            <ul className="-mx-4 mt-2 divide-y border-t sm:-mx-5">
              {data.invoices.map(i => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span><span className="num font-mono">{date(i.issuedAt)}</span><span className="ml-2 text-mute">{INVOICE[i.status] ?? i.status}</span></span>
                  <span className="num font-mono font-semibold">{som(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <SupportLink />
      </div>
    </AppShell>
  );
}

function Usage({ label, used, limit, hint }: { label: string; used: number; limit: number | null; hint?: string | undefined }) {
  const share = limit ? Math.min(1, used / limit) : 0;
  const near = limit !== null && used >= limit * 0.8;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn('num font-mono', near && 'font-semibold text-amber-700')}>{used}{limit !== null ? ` / ${limit}` : ''}<span className="ml-1 font-sans text-xs text-mute">{limit === null ? 'cheksiz' : ''}</span></span>
      </div>
      {limit !== null && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tick"><div className={cn('h-full rounded-full', near ? 'bg-st-kutish' : 'bg-st-tayyor')} style={{ width: `${Math.max(2, share * 100)}%` }} /></div>}
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );
}
