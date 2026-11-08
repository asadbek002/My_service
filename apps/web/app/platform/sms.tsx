'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { platformApi } from './lib';
import { card, field } from './parts';

type Row = {
  id: string; name: string; blocked: boolean; ownAccount: boolean; plan: string | null; planSms: boolean;
  allowance: number | null; enabled: boolean; cap: number | null; sent: number; extra: number; stopped: number;
};
type Overview = { period: string; balance: number | null; total: number; extra: number; stopped: number; rows: Row[] };
const n = (v: number) => v.toLocaleString('ru-RU');

/**
 * Every service's SMS through the platform's Eskiz account this month, with the switch and the hard
 * monthly cap the platform sets per service. Services with their own Eskiz account are shown, not counted.
 */
export function SmsTab({ onError }: { onError: (e: unknown) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => platformApi<Overview>('/sms').then(setData).catch(onError), [onError]);
  useEffect(() => { void load(); }, [load]);

  async function save(id: string, body: { enabled?: boolean; cap?: number | null }) {
    setBusy(id);
    try { await platformApi('/organizations/' + id + '/sms', { method: 'PATCH', body: JSON.stringify(body) }); await load(); }
    catch (e) { onError(e); } finally { setBusy(null); }
  }
  if (!data) return <p className="text-sm text-mute">Yuklanmoqda…</p>;
  const rows = data.rows.filter(r => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Shu oy yuborildi', n(data.total), data.period],
          ['Tarifdan ortiq', n(data.extra), 'keyingi to‘lovda hisoblanadi'],
          ['Limit to‘xtatdi', n(data.stopped), 'yuborilmagan SMS'],
          ['Eskiz balansi', data.balance === null ? '—' : n(Math.round(data.balance)) + " so'm", data.balance === null ? 'Eskiz ulanmagan yoki javob bermadi' : 'platforma hisobi'],
        ] as const).map(([label, value, hint]) => (
          <div key={label} className={card}><p className="eyebrow">{label}</p><p className="num mt-1 font-mono text-2xl font-semibold">{value}</p><p className="mt-0.5 text-xs text-mute">{hint}</p></div>
        ))}
      </section>

      <section className={card + ' space-y-3'}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Servislar bo‘yicha</h2><p className="text-xs text-mute">Limit — oyiga eng ko‘pi bilan shuncha SMS; yetganda SMS to‘xtaydi, Telegram ishlayveradi. Bo‘sh — faqat tarifdagi miqdor, ortig‘i hisoblanadi.</p></div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Servis nomi" type="search" aria-label="Servis bo'yicha qidirish" className={field + ' sm:w-56'} />
        </div>
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-y bg-paper/60 text-left text-xs text-mute">
              <th className="px-4 py-2 font-medium sm:px-5">Servis</th><th className="px-2 py-2 font-medium">Shu oy</th><th className="px-2 py-2 font-medium">Tarifda</th>
              <th className="px-2 py-2 font-medium">Limit</th><th className="px-4 py-2 text-right font-medium sm:px-5">SMS</th>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const ceiling = r.cap ?? r.allowance;
                const pct = ceiling ? Math.min(100, Math.round(r.sent / ceiling * 100)) : 0;
                return (
                  <tr key={r.id} className={r.enabled ? '' : 'bg-paper/50 text-mute'}>
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link href={'/platform/organizations/' + r.id} className="font-medium text-ink hover:underline">{r.name}</Link>
                      <p className="text-xs text-mute">{r.plan ?? 'tarifsiz'}{!r.planSms && ' · tarifda SMS yo‘q'}{r.ownAccount && ' · o‘z Eskiz hisobi'}{r.blocked && ' · bloklangan'}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="num font-mono font-semibold">{n(r.sent)}</span>
                      {r.extra > 0 && <span className="ml-1 text-xs text-amber-700">+{n(r.extra)} ortiq</span>}
                      {r.stopped > 0 && <span className="ml-1 text-xs text-red-700">{n(r.stopped)} to‘xtatildi</span>}
                      {ceiling ? <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-tick"><span className={`block h-full ${pct >= 100 ? 'bg-red-600' : pct >= 80 ? 'bg-st-kutish' : 'bg-st-tayyor'}`} style={{ width: pct + '%' }} /></span> : null}
                    </td>
                    <td className="num px-2 py-2.5 font-mono">{r.allowance === null ? 'cheksiz' : n(r.allowance)}</td>
                    <td className="px-2 py-2.5"><CapInput value={r.cap} disabled={busy === r.id} onSave={cap => save(r.id, { cap })} /></td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      <button role="switch" aria-checked={r.enabled} aria-label={`${r.name}: SMS ${r.enabled ? 'yoqilgan' : 'o‘chirilgan'}`} disabled={busy === r.id}
                        onClick={() => save(r.id, { enabled: !r.enabled })}
                        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${r.enabled ? 'bg-st-tayyor' : 'bg-tick'}`}>
                        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${r.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The cap as a small number field: saved on Enter or when it loses focus; empty = no cap. */
function CapInput({ value, disabled, onSave }: { value: number | null; disabled: boolean; onSave: (cap: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const next = text.trim() === '' ? null : Math.max(0, Math.floor(Number(text)));
    if (next !== value && (next === null || Number.isFinite(next))) onSave(next);
  };
  return (
    <input value={text} onChange={e => setText(e.target.value.replace(/\D/g, '').slice(0, 7))} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      inputMode="numeric" placeholder="yo‘q" disabled={disabled} aria-label="Oylik SMS limiti"
      className="num h-9 w-24 rounded-md border border-line bg-white px-2 font-mono text-sm focus:border-ink focus:outline-none" />
  );
}
