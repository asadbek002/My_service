'use client';
import { use, useEffect, useState } from 'react';
type Quote = { number: string; requiredWork: string; total: string; quoteVersion: number };
export default function Approve({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params); const [quote, setQuote] = useState<Quote | null>(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const url = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api') + '/public/approval/' + encodeURIComponent(token);
  useEffect(() => { fetch(url, { cache: 'no-store', referrerPolicy: 'no-referrer' }).then(async r => { if (!r.ok) throw new Error('Taklif o‘zgargan yoki havola muddati tugagan.'); setQuote(await r.json()); }).catch(e => setMessage(e.message)); }, [token]);
  async function decide(approved: boolean) {
    if (!quote) return; setBusy(true);
    try { const r = await fetch(url, { method: 'POST', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved, quoteVersion: quote.quoteVersion }) }); if (!r.ok) throw new Error('Qaror saqlanmadi. Havolani qayta oching yoki servisga murojaat qiling.'); setDone(true); setMessage(approved ? 'Tasdiqingiz qabul qilindi.' : 'Rad javobingiz qabul qilindi.'); }
    catch(e) { setMessage(e instanceof Error ? e.message : 'Xato'); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">MY SERVICE</p><h2>Ta’mirlash narxini tasdiqlash</h2>{quote && <><p>{quote.number}</p><p>{quote.requiredWork}</p><h2>{quote.total} so‘m</h2>{!done && <div className="actions"><button disabled={busy} onClick={() => decide(true)}>Tasdiqlayman</button><button disabled={busy} className="secondary" onClick={() => decide(false)}>Rad etaman</button></div>}</>}<p role="status">{message}</p></section></main>;
}
