'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { platformApi } from './lib';

export type Plan = {
  id: string; name: string; description: string | null; active: boolean; sortOrder: number;
  maxBranches: number | null; maxStaff: number | null; monthlyOrders: number | null; smsPerMonth: number | null;
  monthlyPrice: string; yearlyPrice: string | null; yearlyTotal?: string;
  features: Record<string, boolean>; _count?: { subscriptions: number };
};
type Billing = { trialDays: number; graceDays: number; extraSmsPrice: string; yearlyFreeMonths: number };

// What a plan switches on. Keys the console does not show are kept as they are when a plan is saved.
export const FEATURES: [string, string][] = [
  ['telegram', 'Telegram xabarlar'], ['sms', 'SMS xabarlar'], ['exports', 'Eksport (CSV, PDF)'], ['own_bot', "O'z Telegram boti"],
];
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + " so'm";
const field = 'w-full h-11 sm:h-10 rounded-md border border-line bg-white px-3 text-base sm:text-sm focus:border-ink focus:outline-none';
const card = 'rounded-lg border bg-white p-4 sm:p-5';
const button = 'h-11 sm:h-10 px-4 rounded-md bg-ink text-white text-sm font-semibold disabled:opacity-50';
const ghost = 'h-11 sm:h-10 px-4 rounded-md border text-sm font-semibold disabled:opacity-50';

/** "99 000" → "99000"; empty stays empty. */
const digits = (v: FormDataEntryValue | null) => String(v ?? '').replace(/[\s,]/g, '');
/** A limit field: empty means unlimited (null). */
const limit = (v: FormDataEntryValue | null) => { const s = digits(v); return s === '' ? null : Number(s); };
const limitText = (v: number | null, unit = '') => v === null ? 'cheksiz' : `${v}${unit}`;

function planBody(d: FormData, base?: Plan) {
  const yearly = digits(d.get('yearlyPrice'));
  return {
    name: String(d.get('name') ?? '').trim(),
    description: String(d.get('description') ?? '').trim() || null,
    monthlyPrice: digits(d.get('monthlyPrice')) || '0',
    yearlyPrice: yearly === '' ? null : yearly,
    maxStaff: limit(d.get('maxStaff')),
    maxBranches: limit(d.get('maxBranches')),
    monthlyOrders: limit(d.get('monthlyOrders')),
    smsPerMonth: limit(d.get('smsPerMonth')),
    sortOrder: Number(digits(d.get('sortOrder')) || 0),
    active: d.get('active') === 'on',
    features: { ...(base?.features ?? {}), ...Object.fromEntries(FEATURES.map(([k]) => [k, d.get(k) === 'on'])) },
  };
}
// The create endpoint takes "absent" for unlimited, not null.
const forCreate = (b: ReturnType<typeof planBody>) => Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null));

function PlanForm({ plan, busy, onSubmit, onCancel }: { plan?: Plan; busy: boolean; onSubmit: (d: FormData) => void; onCancel?: () => void }) {
  const num = (v: number | null | undefined) => v === null || v === undefined ? '' : String(v);
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
      <label className="block space-y-1 text-sm"><span className="font-medium">Nomi</span>
        <input name="name" required maxLength={100} defaultValue={plan?.name} placeholder="Start, Biznes, Pro…" className={field} /></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Qisqa tavsif</span>
        <input name="description" maxLength={500} defaultValue={plan?.description ?? ''} placeholder="Kichik ustaxona uchun" className={field} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm"><span className="font-medium">Oylik narx, so&apos;m</span>
          <input name="monthlyPrice" required inputMode="numeric" pattern="[\d\s]{1,15}" defaultValue={plan ? Number(plan.monthlyPrice).toString() : ''} placeholder="99000" className={field} /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">Yillik narx, so&apos;m</span>
          <input name="yearlyPrice" inputMode="numeric" pattern="[\d\s]{0,15}" defaultValue={plan?.yearlyPrice ? Number(plan.yearlyPrice).toString() : ''} placeholder="avtomatik" className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1 text-sm"><span className="font-medium">Xodim</span>
          <input name="maxStaff" inputMode="numeric" pattern="\d{0,6}" defaultValue={num(plan?.maxStaff)} placeholder="cheksiz" className={field} /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">Filial</span>
          <input name="maxBranches" inputMode="numeric" pattern="\d{0,6}" defaultValue={num(plan?.maxBranches)} placeholder="cheksiz" className={field} /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">Buyurtma / oy</span>
          <input name="monthlyOrders" inputMode="numeric" pattern="\d{0,9}" defaultValue={num(plan?.monthlyOrders)} placeholder="cheksiz" className={field} /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">SMS / oy</span>
          <input name="smsPerMonth" inputMode="numeric" pattern="\d{0,9}" defaultValue={num(plan?.smsPerMonth)} placeholder="cheksiz" className={field} /></label>
      </div>
      <p className="text-[11px] text-mute">Bo&apos;sh qoldirilsa — cheksiz. Yillik narx bo&apos;sh bo&apos;lsa, umumiy sozlamadagi «bepul oylar» bo&apos;yicha hisoblanadi.</p>
      <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {FEATURES.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={plan ? !!plan.features?.[k] : k !== 'own_bot'} className="h-4 w-4" />{l}</label>)}
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="block space-y-1 text-sm"><span className="font-medium">Tartib raqami</span>
          <input name="sortOrder" inputMode="numeric" pattern="\d{0,4}" defaultValue={String(plan?.sortOrder ?? 0)} className={field} /></label>
        <label className="flex h-11 items-center gap-2 text-sm sm:h-10"><input type="checkbox" name="active" defaultChecked={plan?.active ?? true} className="h-4 w-4" />Yangi servislarga ko&apos;rsatilsin</label>
      </div>
      <div className="flex gap-2">
        <button className={button + ' flex-1'} disabled={busy}>{plan ? 'Saqlash' : 'Tarif yaratish'}</button>
        {onCancel && <button type="button" className={ghost} onClick={onCancel}>Bekor</button>}
      </div>
    </form>
  );
}

function BillingCard({ busy, run }: { busy: boolean; run: (action: () => Promise<unknown>, done: string) => Promise<void> }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  useEffect(() => { platformApi<Billing>('/billing-settings').then(setBilling).catch(() => setBilling(null)); }, []);
  if (!billing) return null;
  return (
    <section className={card}>
      <h2 className="mb-1 font-semibold">Umumiy sozlamalar</h2>
      <p className="mb-3 text-xs text-mute">Hamma tariflar uchun bir xil.</p>
      <form key={JSON.stringify(billing)} className="space-y-3" onSubmit={e => {
        e.preventDefault(); const d = new FormData(e.currentTarget);
        const value = { trialDays: Number(digits(d.get('trialDays'))), graceDays: Number(digits(d.get('graceDays'))), extraSmsPrice: digits(d.get('extraSmsPrice')) || '0', yearlyFreeMonths: Number(digits(d.get('yearlyFreeMonths'))) };
        void run(async () => setBilling(await platformApi<Billing>('/billing-settings', { method: 'PUT', body: JSON.stringify(value) })), 'Sozlamalar saqlandi');
      }}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-sm"><span className="font-medium">Tekin sinov, kun</span>
            <input name="trialDays" required inputMode="numeric" pattern="\d{1,3}" defaultValue={billing.trialDays} className={field} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Imtiyozli kunlar</span>
            <input name="graceDays" required inputMode="numeric" pattern="\d{1,2}" defaultValue={billing.graceDays} className={field} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Ortiqcha SMS, so&apos;m</span>
            <input name="extraSmsPrice" required inputMode="numeric" pattern="[\d\s]{1,9}" defaultValue={Number(billing.extraSmsPrice)} className={field} /></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">Yillikda bepul oy</span>
            <input name="yearlyFreeMonths" required inputMode="numeric" pattern="\d{1,2}" defaultValue={billing.yearlyFreeMonths} className={field} /></label>
        </div>
        <p className="text-[11px] text-mute">Imtiyozli kunlar — obuna tugagandan keyin servis yana necha kun to&apos;liq ishlaydi, keyin faqat ko&apos;rish rejimiga o&apos;tadi. Yangi sinov muddati va imtiyoz faqat bundan keyin yaratilgan yoki o&apos;zgartirilgan obunalarga qo&apos;llanadi.</p>
        <button className={button + ' w-full'} disabled={busy}>Saqlash</button>
      </form>
    </section>
  );
}

/** Tariflar: every plan editable in place; a new plan; the platform-wide billing settings. */
export function PlansTab({ plans, busy, run }: { plans: Plan[]; busy: boolean; run: (action: () => Promise<unknown>, done: string) => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className={card + ' space-y-3 lg:col-span-2'}>
        <h2 className="font-semibold">Tariflar</h2>
        {plans.length === 0 && <p className="text-sm text-mute">Hali tarif yo&apos;q</p>}
        {plans.map(p => editing === p.id ? (
          <div key={p.id} className="rounded-lg border border-ink p-3">
            <PlanForm plan={p} busy={busy} onCancel={() => setEditing(null)}
              onSubmit={d => void run(async () => { await platformApi('/plans/' + p.id, { method: 'PATCH', body: JSON.stringify(planBody(d, p)) }); setEditing(null); }, `«${String(d.get('name'))}» saqlandi`)} />
          </div>
        ) : (
          <div key={p.id} className={`rounded-lg border p-3 text-sm ${p.active ? '' : 'bg-paper'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{p.name}{!p.active && <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-mute">yashirin</span>}</p>
                {p.description && <p className="text-xs text-mute">{p.description}</p>}
              </div>
              <button className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold hover:border-ink" onClick={() => setEditing(p.id)}>Tahrirlash</button>
            </div>
            <p className="num mt-2 font-mono text-base font-semibold">{money(p.monthlyPrice)}<span className="font-sans text-xs font-normal text-mute"> / oy</span>
              {p.yearlyTotal && <span className="ml-3 font-sans text-xs font-normal text-mute">yiliga {money(p.yearlyTotal)}{p.yearlyPrice === null ? ' (avto)' : ''}</span>}</p>
            <p className="mt-1 text-xs text-mute">Xodim: {limitText(p.maxStaff)} · Filial: {limitText(p.maxBranches)} · Buyurtma/oy: {limitText(p.monthlyOrders)} · SMS/oy: {limitText(p.smsPerMonth)}</p>
            <p className="text-xs text-mute">{FEATURES.filter(([k]) => p.features?.[k]).map(([, l]) => l).join(' · ') || "Qo'shimcha imkoniyat yo'q"}</p>
            {p._count && <p className="mt-1 text-xs text-mute">{p._count.subscriptions} ta servis shu tarifda</p>}
          </div>
        ))}
        <p className="text-xs text-mute">Narx yoki cheklov o&apos;zgarsa, shu tarifdagi servislarga darhol qo&apos;llanadi. Tarifni o&apos;chirish o&apos;rniga yashiring: undagi servislar ishlashda davom etadi.</p>
      </section>
      <div className="space-y-6">
        <section className={card}>
          <h2 className="mb-3 font-semibold">Yangi tarif</h2>
          <PlanForm key={plans.length} busy={busy} onSubmit={d => void run(() => platformApi('/plans', { method: 'POST', body: JSON.stringify(forCreate(planBody(d))) }), 'Tarif yaratildi')} />
        </section>
        <BillingCard busy={busy} run={run} />
      </div>
    </div>
  );
}
