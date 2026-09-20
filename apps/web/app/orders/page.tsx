'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
type Order = { id: string; number: string; status: string; total: string; customer: { firstName: string; phone: string }; device: { brand: string; model: string } };
type Customer = { id: string; firstName: string; phone: string };
type Branch = { id: string; name: string };
export default function Orders() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  function fail(e: unknown) { if (e instanceof Error && e.message === 'SESSION_EXPIRED') router.replace('/login'); else setError(e instanceof Error ? e.message : 'Ulanishda xato'); }
  async function load() {
    const me = await api<{ permissions: string[] }>('/auth/me'); setPermissions(me.permissions);
    setOrders(await api<Order[]>('/orders')); setBranches(await api<Branch[]>('/branches'));
    if (me.permissions.includes('customers.view')) setCustomers(await api<Customer[]>('/customers'));
  }
  useEffect(() => { load().catch(fail); }, []);
  async function customer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try { const c = await api<Customer>('/customers', { method: 'POST', body: JSON.stringify({ firstName: data.get('firstName'), phone: data.get('phone') }) }); setCustomers(old => [c, ...old]); setCustomerId(c.id); }
    catch(e) { fail(e); } finally { setBusy(false); }
  }
  async function device(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try { const d = await api<{ id: string }>('/devices', { method: 'POST', body: JSON.stringify({ customerId, category: data.get('category'), brand: data.get('brand'), model: data.get('model'), ...(data.get('imei') ? { imei: data.get('imei') } : {}) }) }); setDeviceId(d.id); }
    catch(e) { fail(e); } finally { setBusy(false); }
  }
  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    if (!navigator.onLine) { setError('Internet yo‘q. Qabul saqlanmadi.'); setBusy(false); return; }
    try { const o = await api<{ id: string }>('/orders', { method: 'POST', body: JSON.stringify({ customerId, deviceId, branchId: data.get('branchId'), complaint: data.get('complaint'), accessories: String(data.get('accessories')).split(',').map(s => s.trim()).filter(Boolean), condition: String(data.get('condition')).split(',').map(s => s.trim()).filter(Boolean) }) }); router.push('/orders/' + o.id); }
    catch(e) { fail(e); } finally { setBusy(false); }
  }
  return <main className="page"><header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/dashboard">Bosh sahifa</Link></header>
    <div className="title-row"><div><p className="eyebrow">SERVIS JARAYONI</p><h1>Buyurtmalar</h1></div>{permissions.includes('orders.create') && <button onClick={() => setShowNew(!showNew)}>+ Yangi qabul</button>}</div>
    {error && <p role="alert" className="error">{error}</p>}
    {showNew && <div className="intake-grid">
      <section><h2>1. Mijoz</h2><label>Mavjud mijoz<select value={customerId} onChange={e => { setCustomerId(e.target.value); setDeviceId(''); }}><option value="">Tanlang</option>{customers.map(c => <option key={c.id} value={c.id}>{c.firstName} — {c.phone}</option>)}</select></label>
      <hr/><form onSubmit={customer}><label>Ism<input name="firstName" required /></label><label>Telefon<input name="phone" type="tel" required placeholder="+998901234567" /></label><button disabled={busy}>Yangi mijoz yaratish</button></form></section>
      <section><h2>2. Qurilma</h2>{deviceId ? <p className="success">Qurilma saqlandi.</p> : <form onSubmit={device}><label>Kategoriya<input name="category" defaultValue="Telefon" required /></label><label>Brend<input name="brand" required /></label><label>Model<input name="model" required /></label><label>IMEI<input name="imei" /></label><button disabled={busy || !customerId}>Qurilmani saqlash</button></form>}</section>
      <section><h2>3. Qabul tafsilotlari</h2><form onSubmit={receive}><label>Filial<select name="branchId" required>{branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label><label>Mijoz shikoyati<textarea name="complaint" required maxLength={4000}/></label><label>Komplektatsiya<input name="accessories" placeholder="Telefon, kabel, chexol" /></label><label>Tashqi holat<input name="condition" placeholder="Ekran singan, tirnalgan" /></label><button disabled={busy || !deviceId}>Qabul qilish</button></form></section>
    </div>}
    <section><div className="table-scroll"><table><thead><tr><th>Raqam</th><th>Mijoz</th><th>Qurilma</th><th>Holat</th><th>Jami</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td><Link href={'/orders/' + o.id}>{o.number}</Link></td><td>{o.customer.firstName}<small>{o.customer.phone}</small></td><td>{o.device.brand} {o.device.model}</td><td>{o.status}</td><td>{Number(o.total).toLocaleString('uz-UZ')} so‘m</td></tr>)}</tbody></table>{orders.length === 0 && <p className="muted">Hozircha buyurtmalar yo‘q.</p>}</div></section>
  </main>;
}
