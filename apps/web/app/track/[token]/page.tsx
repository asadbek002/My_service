'use client';
import { use, useEffect, useState } from 'react';
type Tracking = { number: string; status: string; device: string; total: string; balance: string; receivedAt: string; warrantyEnd: string | null };
export default function Track({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params); const [data, setData] = useState<Tracking | null>(null); const [error, setError] = useState('');
  useEffect(() => { fetch((process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api') + '/public/track/' + encodeURIComponent(token), { cache: 'no-store', referrerPolicy: 'no-referrer' }).then(async r => { if (!r.ok) throw new Error('Havola topilmadi yoki muddati tugagan.'); setData(await r.json()); }).catch(e => setError(e.message)); }, [token]);
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">MY SERVICE</p>{error ? <p role="alert">{error}</p> : !data ? <p>Yuklanmoqda…</p> : <><h1>{data.number}</h1><h2>{data.device}</h2><p>{data.status}</p><p>Jami: {data.total} so‘m</p><p>Qoldiq: {data.balance} so‘m</p><p>Qabul: {new Date(data.receivedAt).toLocaleDateString('uz-UZ')}</p>{data.warrantyEnd && <p>Kafolat: {new Date(data.warrantyEnd).toLocaleDateString('uz-UZ')} gacha</p>}</>}</section></main>;
}
