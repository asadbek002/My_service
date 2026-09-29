'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { date, EXPENSE_CATEGORIES, money, normalizePhone } from '../../lib/format';
import { cn } from '../../lib/utils';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from '../../components/ui/form-field';
import { ErrorBox, Loading, Notice } from '../../components/ui/feedback';

type Setting = { key: string; value: Record<string, unknown> };
type Template = { type: string; channel: string; body: string; active: boolean };
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export default function Settings() {
  const { data: rows, isLoading, error } = useQuery({ queryKey: ['settings', 'general'], queryFn: () => api<Setting[]>('/settings/general') });
  const value = (key: string) => rows?.find(r => r.key === key)?.value ?? {};
  return (
    <AppShell title="Sozlamalar" narrow>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={4} /> : (
        <div className="space-y-4">
          <ServiceForm general={value('general')} receipt={value('receipt')} />
          <WarrantyForm terms={str(value('warranty_terms').text)} />
          <ExpenseCategories items={value('expense_categories').items} />
          <ReadyMessage />
          <Channels />
          <Subscription />
        </div>
      )}
    </AppShell>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-mute">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Save handler shared by the setting forms: one key, one JSON value. */
function useSave() {
  const qc = useQueryClient();
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);
  async function save(key: string, value: Record<string, unknown>, ok = 'Saqlandi') {
    setBusy(true); setState({});
    try {
      await api('/settings/general/' + key, { method: 'PUT', body: JSON.stringify({ value }) });
      await Promise.all([qc.invalidateQueries({ queryKey: ['settings'] }), qc.invalidateQueries({ queryKey: ['defaults'] })]);
      setState({ ok });
    } catch (e) { setState({ error: errorText(e) }); } finally { setBusy(false); }
  }
  return { save, busy, state };
}

function ServiceForm({ general, receipt }: { general: Record<string, unknown>; receipt: Record<string, unknown> }) {
  const [width, setWidth] = useState<58 | 80>(receipt.width === 58 ? 58 : 80);
  const { save, busy, state } = useSave();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const phone = String(d.get('phone') ?? '').trim();
    await save('general', { name: String(d.get('name') ?? '').trim(), phone: phone ? normalizePhone(phone) : '', address: String(d.get('address') ?? '').trim() });
    await save('receipt', { width, footer: String(d.get('footer') ?? '').trim(), telegram: String(d.get('telegram') ?? '').trim(), instagram: String(d.get('instagram') ?? '').trim() });
  }
  return (
    <Block title="Servis va chek" hint="Chekning tepasida va pastida chiqadi">
      <form onSubmit={submit} className="grid gap-3">
        <FormField label="Servis nomi"><Input name="name" defaultValue={str(general.name)} placeholder="Masalan: Mobile Fix" /></FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Telefon"><Input name="phone" defaultValue={str(general.phone)} inputMode="tel" placeholder="+998 90 123 45 67" /></FormField>
          <FormField label="Manzil"><Input name="address" defaultValue={str(general.address)} placeholder="Chilonzor, 9-kvartal" /></FormField>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Chek printeri qog&apos;ozi</p>
          <div className="flex gap-2">
            {([58, 80] as const).map(w => (
              <button type="button" key={w} onClick={() => setWidth(w)} aria-pressed={width === w}
                className={cn('h-10 flex-1 rounded-md border text-sm sm:flex-none sm:px-5', width === w ? 'border-ink bg-ink text-white' : 'bg-white')}>{w} mm</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-mute">Bilmasangiz, qog&apos;oz rulonining enini o&apos;lchang. Ko&apos;pchilik printerlar 80 mm.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Telegram"><Input name="telegram" defaultValue={typeof receipt.telegram === 'string' ? receipt.telegram : '@myserviceuzz'} autoCapitalize="none" /></FormField>
          <FormField label="Instagram"><Input name="instagram" defaultValue={typeof receipt.instagram === 'string' ? receipt.instagram : 'myserviceuz'} autoCapitalize="none" /></FormField>
        </div>
        <FormField label="Chek oxiridagi matn"><Textarea name="footer" defaultValue={str(receipt.footer)} rows={2} placeholder="Xaridingiz uchun rahmat!" /></FormField>
        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
        <Button disabled={busy} className="sm:w-fit">Saqlash</Button>
      </form>
    </Block>
  );
}

function WarrantyForm({ terms }: { terms: string }) {
  const { save, busy, state } = useSave();
  const [text, setText] = useState(terms);
  return (
    <Block title="Kafolat shartlari" hint="Berish chekida chiqadi. Kafolat kunlari har safar berishda so'raladi.">
      <div className="grid gap-3">
        <Textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Ta'mirlangan qism uchun kafolat. Namlik va zarbaga tatbiq etilmaydi." />
        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
        <Button disabled={busy} className="sm:w-fit" onClick={() => save('warranty_terms', { text: text.trim() })}>Saqlash</Button>
      </div>
    </Block>
  );
}

function ExpenseCategories({ items }: { items: unknown }) {
  const initial = Array.isArray(items) && items.length ? items.filter((x): x is string => typeof x === 'string') : Object.keys(EXPENSE_CATEGORIES);
  const [list, setList] = useState(initial);
  const [next, setNext] = useState('');
  const { save, busy, state } = useSave();
  const add = () => { const v = next.trim(); if (v && !list.includes(v)) setList([...list, v]); setNext(''); };
  return (
    <Block title="Xarajat turlari">
      <div className="flex flex-wrap gap-2">
        {list.map(item => (
          <span key={item} className="inline-flex h-9 items-center gap-1 rounded-full border pl-3.5 pr-1 text-sm">
            {EXPENSE_CATEGORIES[item] ?? item}
            <button type="button" onClick={() => setList(list.filter(x => x !== item))} className="flex h-7 w-7 items-center justify-center rounded-full text-mute hover:bg-black/[0.05] hover:text-ink" aria-label={`${item} ni olib tashlash`}>×</button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={next} onChange={e => setNext(e.target.value)} placeholder="Yangi tur" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button type="button" variant="secondary" onClick={add} disabled={!next.trim()}>Qo&apos;shish</Button>
      </div>
      <ErrorBox className="mt-3">{state.error}</ErrorBox><Notice className="mt-3">{state.ok}</Notice>
      <Button className="mt-3 sm:w-fit" disabled={busy || list.length === 0} onClick={() => save('expense_categories', { items: list })}>Saqlash</Button>
    </Block>
  );
}

const VARIABLES = '{{customer_name}} {{order_number}} {{device}} {{price}} {{balance}} {{link}}';
function ReadyMessage() {
  const { data } = useQuery({ queryKey: ['settings', 'templates'], queryFn: () => api<Template[]>('/settings/notifications') });
  return (
    <Block title="Tayyor bo'lganda xabar" hint="Mijozga faqat qurilma tayyor bo'lganda xabar boradi: avval Telegram, bo'lmasa SMS. Bo'sh qoldirilsa standart matn ketadi.">
      <div className="grid gap-4">
        {(['TELEGRAM', 'SMS'] as const).map(channel => <TemplateForm key={channel + (data ? 1 : 0)} channel={channel} template={data?.find(t => t.type === 'ORDER_READY' && t.channel === channel)} />)}
        <p className="text-xs text-mute">O&apos;zgaruvchilar: <span className="font-mono">{VARIABLES}</span></p>
      </div>
    </Block>
  );
}
function TemplateForm({ channel, template }: { channel: 'TELEGRAM' | 'SMS'; template?: Template | undefined }) {
  const [body, setBody] = useState(template?.body ?? '');
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  useEffect(() => { setBody(template?.body ?? ''); }, [template?.body]);
  async function save() {
    setState({});
    try {
      await api(`/settings/notifications/ORDER_READY/${channel}`, { method: 'PUT', body: JSON.stringify({ body: body.trim() || ' ', active: !!body.trim() }) });
      setState({ ok: 'Saqlandi' });
    } catch (e) { setState({ error: errorText(e) }); }
  }
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{channel === 'TELEGRAM' ? 'Telegram' : 'SMS'}</span>
      <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Hurmatli {{customer_name}}, {{device}} tayyor. To'lov: {{balance}} so'm." />
      <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
      <Button variant="secondary" size="sm" className="w-fit" onClick={save}>Saqlash</Button>
    </div>
  );
}

type Telegram = { botConfigured: boolean; botUsername: string | null; webhookConfigured: boolean; linkedCustomers: number; totalCustomers: number };
type Eskiz = { configured: boolean; sender: string; testMode: boolean; balance: number; smsCount: number; error?: string | null };
function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <p className="flex items-start gap-2 text-sm">{ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}<span>{children}</span></p>;
}
function Channels() {
  const telegram = useQuery({ queryKey: ['settings', 'telegram'], queryFn: () => api<Telegram>('/settings/telegram') });
  const eskiz = useQuery({ queryKey: ['settings', 'eskiz'], queryFn: () => api<Eskiz>('/notifications/eskiz-status') });
  const [testPhone, setTestPhone] = useState('');
  const [state, setState] = useState<{ ok?: string; error?: string }>({});
  async function test() {
    setState({});
    try { await api('/notifications/test-sms', { method: 'POST', body: JSON.stringify({ phone: normalizePhone(testPhone) }) }); setState({ ok: 'Test SMS yuborildi' }); }
    catch (e) { setState({ error: errorText(e) }); }
  }
  const t = telegram.data, s = eskiz.data;
  return (
    <Block title="Telegram va SMS">
      <div className="grid gap-2">
        {t && <>
          <Check ok={t.botConfigured && !!t.botUsername}>Telegram bot {t.botUsername ? '@' + t.botUsername : 'sozlanmagan'}</Check>
          <p className="pl-6 text-xs text-mute">{t.linkedCustomers} / {t.totalCustomers} mijoz Telegramga ulangan. Ulash: buyurtma sahifasidagi &laquo;Holat havolasi&raquo;.</p>
        </>}
        {s && <>
          <Check ok={s.configured && !s.error}>SMS (Eskiz) {s.configured ? (s.error ? '— ulanishda xato' : `— balans ${money(s.balance)}`) : 'sozlanmagan'}{s.testMode ? ' · test rejimi' : ''}</Check>
          {s.configured && (
            <div className="mt-2 flex gap-2 pl-6">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" aria-label="Test uchun telefon" />
              <Button variant="secondary" onClick={test} disabled={!testPhone.trim()}>Test SMS</Button>
            </div>
          )}
        </>}
        <ErrorBox>{state.error}</ErrorBox><Notice>{state.ok}</Notice>
      </div>
    </Block>
  );
}

type Sub = { status: string; expiresAt: string; graceUntil?: string | null; plan: { name: string } };
const SUB_STATUS: Record<string, string> = { ACTIVE: 'Faol', TRIAL: 'Sinov muddati', SUSPENDED: "To'xtatilgan", EXPIRED: 'Muddati tugagan' };
function Subscription() {
  const { data: sub } = useQuery({ queryKey: ['settings', 'subscription'], queryFn: () => api<Sub | null>('/settings/subscription') });
  if (!sub) return null;
  return (
    <Block title="Obuna">
      <p className="text-sm">{sub.plan.name} · {SUB_STATUS[sub.status] ?? sub.status} · <b>{date(sub.graceUntil ?? sub.expiresAt)}</b> gacha</p>
    </Block>
  );
}
