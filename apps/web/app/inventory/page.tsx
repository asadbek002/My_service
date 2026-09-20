'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
type Part = { id: string; name: string; sku: string; salePrice: string; stocks: { branchId: string; onHand: number; reserved: number }[] };
export default function Inventory() {
  const router = useRouter(); const [parts, setParts] = useState<Part[]>([]); const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [manage, setManage] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  function fail(e: unknown) { if (e instanceof Error && e.message === 'SESSION_EXPIRED') router.replace('/login'); else setError(e instanceof Error ? e.message : 'Xato'); }
  async function load() { setParts(await api<Part[]>('/inventory')); setBranches(await api<typeof branches>('/branches')); setManage((await api<{ permissions: string[] }>('/auth/me')).permissions.includes('inventory.manage')); }
  useEffect(() => { load().catch(fail); }, []);
  async function submit(e: FormEvent<HTMLFormElement>, path: string) {
    e.preventDefault(); const form = e.currentTarget; const d = Object.fromEntries(new FormData(form)); setBusy(true); setError('');
    try { await api('/inventory/' + path, { method: 'POST', body: JSON.stringify(path === 'parts' ? d : { ...d, quantity: Number(d.quantity) }) }); form.reset(); await load(); }
    catch(e) { fail(e); } finally { setBusy(false); }
  }
  return <main className="page"><header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/orders">Buyurtmalar</Link></header><h1>Ombor</h1>{error && <p role="alert" className="error">{error}</p>}
    <section><div className="table-scroll"><table><thead><tr><th>Detal</th><th>SKU</th><th>Sotuv narxi</th><th>Mavjud</th><th>Rezerv</th><th>Erkin</th></tr></thead><tbody>{parts.map(p => { const n = p.stocks.reduce((s, x) => s + x.onHand, 0); const r = p.stocks.reduce((s, x) => s + x.reserved, 0); return <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.salePrice}</td><td>{n}</td><td>{r}</td><td>{n-r}</td></tr>; })}</tbody></table></div></section>
    {manage && <div className="detail-grid" style={{ marginTop: 24 }}><section><h2>Yangi detal</h2><form onSubmit={e => submit(e, 'parts')}><label>Nomi<input name="name" required /></label><label>SKU<input name="sku" required /></label><label>Xarid narxi<input name="purchasePrice" type="number" min="0" step=".01" required /></label><label>Sotuv narxi<input name="salePrice" type="number" min="0" step=".01" required /></label><button disabled={busy}>Detal yaratish</button></form></section>
    <section><h2>Omborga kirim</h2><form onSubmit={e => submit(e, 'receive')}><label>Filial<select name="branchId" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Detal<select name="partId" required>{parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Soni<input name="quantity" type="number" min="1" required /></label><label>Sabab / yetkazib beruvchi<input name="reason" required minLength={3} /></label><button disabled={busy}>Kirimni saqlash</button></form></section><section><h2>Qoldiqni tuzatish</h2><form onSubmit={e => submit(e, 'adjust')}><label>Filial<select name="branchId" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Detal<select name="partId" required>{parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Farq (+/−)<input name="quantity" type="number" required /></label><label>Sabab<input name="reason" required minLength={3}/></label><button disabled={busy}>Tuzatishni saqlash</button></form></section><section><h2>Filiallararo transfer</h2><form onSubmit={e => submit(e, 'transfer')}><label>Qayerdan<select name="fromBranchId" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Qayerga<select name="toBranchId" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Detal<select name="partId" required>{parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Soni<input name="quantity" type="number" min="1" required /></label><label>Sabab<input name="reason" required minLength={3}/></label><button disabled={busy}>Transfer qilish</button></form></section></div>}
  </main>;
}
