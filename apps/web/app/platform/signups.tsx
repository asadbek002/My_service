'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { platformApi } from './lib';
import { card, field } from './parts';

type Attempt = {
  id: string; phone: string; stage: 'CODE_SENT' | 'VERIFIED' | 'COMPLETED'; method: 'SMS' | 'TELEGRAM' | null;
  codesSent: number; wrongCodes: number; lastError: string | null; lastErrorAt: string | null;
  serviceName: string | null; login: string | null; organizationId: string | null; organizationName: string | null;
  createdAt: string; updatedAt: string;
};
type Signups = { summary: { started: number; verified: number; completed: number }; rows: Attempt[] };

const STAGE: Record<Attempt['stage'], [string, string, string]> = {
  CODE_SENT: ['Kod so‘radi', 'text-st-qabul-ink', 'Telefonni tasdiqlamagan'],
  VERIFIED: ['Tasdiqladi', 'text-st-tamir-ink', 'Ustaxona ma’lumotlarini to‘ldirmagan'],
  COMPLETED: ['Ochildi', 'text-st-tayyor-ink', ''],
};
// What each error means for the person who hit it, and so what to do about it.
const ERROR: Record<string, string> = {
  SMS_UNAVAILABLE: 'SMS ketmadi (Eskiz xatosi yoki balans)',
  TOO_MANY_CODES: 'Kod so‘rash limiti tugadi (soatiga 5 ta)',
  RESEND_TOO_SOON: 'Kodni juda tez qayta so‘radi',
  CODE_WRONG: 'Noto‘g‘ri kod kiritdi',
  CODE_EXPIRED: 'Kod muddati o‘tgan yoki 5 marta xato',
  LOGIN_TAKEN: 'Tanlagan logini band',
  PHONE_TAKEN: 'Bu raqamda allaqachon servis bor',
  PHONE_NOT_VERIFIED: 'Tasdiq muddati o‘tdi (30 daqiqa)',
  SIGNUP_CLOSED: 'Ro‘yxatdan o‘tish yopiq edi',
  INVALID_INPUT: 'Forma noto‘g‘ri to‘ldirildi',
  'SMS faqat O‘zbekiston raqamlariga yuboriladi': 'Chet el raqami',
};
const errorText = (code: string) => ERROR[code] ?? code;
const when = (v: string) => new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pct = (a: number, b: number) => b ? Math.round(a / b * 100) + '%' : '—';
const FILTERS = [['open', 'Tugatmagan'], ['error', 'Xato bilan'], ['done', 'Ochilgan'], ['', 'Hammasi']] as const;

/** Self sign-ups as a funnel: everyone who asked for a code, where they stopped and why — to call them. */
export function SignupsTab({ onError }: { onError: (e: unknown) => void }) {
  const [state, setState] = useState<(typeof FILTERS)[number][0]>('open');
  const [q, setQ] = useState('');
  const [data, setData] = useState<Signups | null>(null);
  const load = useCallback(() => platformApi<Signups>(`/signups?state=${state}&q=${encodeURIComponent(q)}`).then(setData).catch(onError), [state, q, onError]);
  useEffect(() => { const t = setTimeout(() => void load(), q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  const s = data?.summary;

  return (
    <div className="space-y-5">
      {s && (
        <section className={card}>
          <p className="eyebrow">Oxirgi 30 kun</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([['Kod so‘radi', s.started, ''], ['Telefonni tasdiqladi', s.verified, pct(s.verified, s.started)], ['Servis ochdi', s.completed, pct(s.completed, s.started)]] as const).map(([label, value, share]) => (
              <div key={label} className="min-w-0">
                <p className="num font-mono text-2xl font-semibold">{value}</p>
                <p className="text-xs text-mute">{label}{share && <> · <b className="text-ink">{share}</b></>}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={card + ' space-y-3'}>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(([k, l]) => <button key={k} className="chip" aria-pressed={state === k} onClick={() => setState(k)}>{l}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Telefon raqami" inputMode="tel" type="search" aria-label="Telefon bo'yicha qidirish" className={field + ' sm:ml-auto sm:w-52'} />
        </div>
        {!data ? <p className="text-sm text-mute">Yuklanmoqda…</p> : data.rows.length === 0 ? <p className="py-6 text-center text-sm text-mute">Bu yerda hech kim yo‘q</p> : (
          <ul className="-mx-4 divide-y border-t sm:-mx-5">
            {data.rows.map(r => {
              const [label, color, hint] = STAGE[r.stage];
              return (
                <li key={r.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a href={'tel:' + r.phone} className="num font-mono font-semibold hover:underline">{r.phone}</a>
                    <span className={`inline-flex rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${color}`}>{label}</span>
                    {r.method && <span className="text-xs text-mute">{r.method === 'TELEGRAM' ? 'Telegram orqali' : 'SMS orqali'}</span>}
                    <span className="ml-auto text-xs text-mute">{when(r.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    {r.stage === 'COMPLETED' && r.organizationId
                      ? <Link href={'/platform/organizations/' + r.organizationId} className="font-medium underline">{r.organizationName ?? r.serviceName}</Link>
                      : <span className="text-mute">{hint}{r.serviceName ? ` · «${r.serviceName}»` : ''}{r.login ? ` · login: ${r.login}` : ''}</span>}
                  </div>
                  {r.lastError && r.stage !== 'COMPLETED' && (
                    <p className="mt-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-[13px] text-red-800">⚠ {errorText(r.lastError)}{r.lastErrorAt ? ` · ${when(r.lastErrorAt)}` : ''}</p>
                  )}
                  <p className="mt-1 text-xs text-mute">Boshlagan: {when(r.createdAt)} · {r.codesSent} ta SMS kod{r.wrongCodes ? ` · ${r.wrongCodes} marta xato kod` : ''}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
