'use client';
import { use, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, apiBlob, uploadAttachment } from '../../lib/api';
type Order = { id: string; number: string; status: string; complaint: string; total: string; quoteVersion: number; diagnosis: string | null; requiredWork: string | null; customer: { firstName: string; phone: string }; device: { brand: string; model: string }; history: { id: string; toStatus: string; comment: string; createdAt: string }[] };
export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [balance, setBalance] = useState('');
  const [parts, setParts] = useState<{ id: string; name: string; salePrice: string }[]>([]);
  const [staff, setStaff] = useState<{ id: string; firstName: string }[]>([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<{ id:string;kind:string;size:number }[]>([]);
  const [links, setLinks] = useState<{ tracking: string; telegram: string | null } | null>(null);
  const [paymentKey, setPaymentKey] = useState('');
  const [payments, setPayments] = useState<{ id: string; kind: string; amount: string; method: string }[]>([]);
  const path = '/orders/' + id;
  const can = (key: string) => permissions.includes(key);
  function fail(e: unknown) { if (e instanceof Error && e.message === 'SESSION_EXPIRED') router.replace('/login'); else setError(e instanceof Error ? e.message : 'So‘rov bajarilmadi'); }
  async function load() {
    const me = await api<{ permissions: string[] }>('/auth/me'); setPermissions(me.permissions);
    setOrder(await api<Order>(path)); try { setAttachments(await api(path + '/attachments')); } catch {}
    if (me.permissions.includes('payments.view')) { const p = await api<{ balance: string; entries: typeof payments }>(path + '/payments'); setBalance(p.balance); setPayments(p.entries); }
    if (me.permissions.includes('inventory.view')) { try { setParts(await api<typeof parts>('/inventory')); } catch {} }
    if (me.permissions.includes('orders.assign')) setStaff(await api<typeof staff>('/orders/technicians'));
  }
  useEffect(() => { setPaymentKey(crypto.randomUUID()); load().catch(fail); }, [id]);
  async function action(endpoint: string, body?: unknown, method = 'POST') {
    if (!navigator.onLine) { setError('Internet yo‘q. Amal bajarilmadi.'); return; }
    setBusy(true); setError('');
    try { await api(path + endpoint, { method, ...(body ? { body: JSON.stringify(body) } : {}) }); await load(); }
    catch(e) { fail(e); } finally { setBusy(false); }
  }
  const form = (callback: (d: FormData) => void) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); callback(new FormData(e.currentTarget)); };
  if (!order) return <main className="page"><p role="status">{error || 'Yuklanmoqda…'}</p></main>;
  return <main className="page"><header><Link href="/orders">← Buyurtmalar</Link><span className="brand">MY SERVICE</span></header>
    <div className="title-row"><div><p className="eyebrow">{order.status}</p><h1>{order.number}</h1></div><strong>{Number(order.total).toLocaleString('uz-UZ')} so‘m</strong></div>
    {error && <p role="alert" className="error">{error}</p>}
    <section style={{marginBottom:24}}><h2>Hujjatlar</h2><div className="actions">{['receipt','repair','payment','warranty'].map(type=><button className="secondary" key={type} onClick={async()=>{try{const blob=await apiBlob(path+'/documents/'+type);window.open(URL.createObjectURL(blob),'_blank','noopener,noreferrer')}catch(e){fail(e)}}}>{type}</button>)}</div></section>
    {can('orders.edit') && <section style={{ marginBottom: 24 }}><button disabled={busy} onClick={async () => { setBusy(true); try { setLinks(await api(path + '/links', { method: 'POST' })); } catch(e) { fail(e); } finally { setBusy(false); } }}>Mijoz uchun havolalar</button>{links && <><p><a href={links.tracking} target="_blank" rel="noreferrer">Buyurtmani kuzatish</a></p>{links.telegram && <p><a href={links.telegram} target="_blank" rel="noreferrer">Telegramni ulash</a></p>}</>}</section>}
    <div className="detail-grid"><section><h2>Qurilma rasmlari</h2><p className="muted">JPEG, PNG yoki WebP; 10 MB gacha.</p><input type="file" accept="image/jpeg,image/png,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{await uploadAttachment(id,file,'DAMAGE');await load()}catch(e){fail(e)}finally{setBusy(false)}}}/>{attachments.map(x=><p key={x.id}>{x.kind} · {Math.round(x.size/1024)} KB</p>)}</section><section><h2>{order.device.brand} {order.device.model}</h2><p>{order.customer.firstName} · {order.customer.phone}</p><p className="muted">{order.complaint}</p>
      {order.diagnosis && <><h3>Diagnostika</h3><p>{order.diagnosis}</p><p>{order.requiredWork}</p></>}
      <div className="actions">{order.status === 'RECEIVED' && can('orders.change_status') && <button disabled={busy} onClick={() => action('/status', { status: 'DIAGNOSING', comment: 'Diagnostika boshlandi' }, 'PATCH')}>Diagnostikani boshlash</button>}
      {['WAITING_PART','IN_REPAIR'].includes(order.status) && can('orders.change_status') && <><button disabled={busy} onClick={() => action('/repair/start')}>Ishni boshlash / davom etish</button><button disabled={busy} className="secondary" onClick={() => action('/repair/pause')}>Tanaffus</button></>}</div>
      {can('orders.assign') && <form onSubmit={form(d => action('/assign', { userId: d.get('userId'), task: d.get('task') }))}><h3>Ustaga biriktirish</h3><label>Usta<select name="userId" required>{staff.map(s => <option key={s.id} value={s.id}>{s.firstName}</option>)}</select></label><label>Vazifa<input name="task" required /></label><button disabled={busy}>Biriktirish</button></form>}
    </section><section><h2>Holatlar tarixi</h2><ol className="timeline">{order.history.map(h => <li key={h.id}><strong>{h.toStatus}</strong><p>{h.comment}</p><small>{new Date(h.createdAt).toLocaleString('uz-UZ')}</small></li>)}</ol></section>
    {['DIAGNOSING','WAITING_CUSTOMER_APPROVAL'].includes(order.status) && can('diagnostics.create') && <section><h2>Diagnostika va narx</h2><form onSubmit={form(d => action('/diagnosis', Object.fromEntries(d)))}>
      <label>Diagnostika<textarea name="diagnosis" required /></label><label>Bajariladigan ish<textarea name="requiredWork" required /></label><label>Ish haqi (so‘m)<input name="labor" type="number" min="0" step=".01" required /></label><label>Detallar (so‘m)<input name="partsTotal" type="number" min="0" step=".01" required /></label><button disabled={busy}>Tasdiqqa yuborish</button>
    </form></section>}
    {order.status === 'WAITING_CUSTOMER_APPROVAL' && can('orders.edit') && <section><h2>Mijoz qarori</h2><p className="muted">Narx taklifi: {order.quoteVersion}. Mijoz bilan suhbat natijasini qayd eting.</p><form onSubmit={form(d => action('/approve', { quoteVersion: order.quoteVersion, approved: d.get('approved') === 'yes', evidence: d.get('evidence') }))}><label>Qaror<select name="approved"><option value="yes">Tasdiqladi</option><option value="no">Rad etdi</option></select></label><label>Tasdiq izohi<textarea name="evidence" required minLength={3} /></label><button disabled={busy}>Qarorni saqlash</button></form></section>}
    {['WAITING_PART','IN_REPAIR'].includes(order.status) && can('inventory.use') && <section><h2>Buyurtma detallari</h2><form onSubmit={form(d => action('/parts', { partId: d.get('partId'), quantity: Number(d.get('quantity')) }))}><label>Detal<select name="partId" required>{parts.map(p => <option key={p.id} value={p.id}>{p.name} — {p.salePrice}</option>)}</select></label><label>Soni<input name="quantity" type="number" min="1" defaultValue="1" required /></label><button disabled={busy}>Rezerv qilish</button></form>
      {order.status === 'IN_REPAIR' && <form onSubmit={form(d => action('/parts/' + d.get('partId') + '/use'))}><h3>Detalni ishlatish</h3><label>Detal<select name="partId" required>{parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy}>Ishlatildi</button></form>}
    </section>}
    {order.status === 'IN_REPAIR' && can('orders.change_status') && <section><h2>Yakuniy tekshiruv</h2><form onSubmit={form(d => action('/repair/finish', { passedChecks: d.getAll('checks') }))}>{['Display','Touch','Camera','Microphone','Speaker','Charging','Wi-Fi','Bluetooth'].map(check => <label className="check" key={check}><input type="checkbox" name="checks" value={check} required/>{check}</label>)}<button disabled={busy}>Ta’mir tugadi</button></form></section>}
    {can('payments.view') && <section><h2>To‘lovlar</h2><p>Qoldiq: <strong>{Number(balance).toLocaleString('uz-UZ')} so‘m</strong></p>{payments.map(p => <p key={p.id}>{p.kind} · {p.method} · {p.amount} so‘m</p>)}
      {can('payments.create') && !['DELIVERED','CANCELLED'].includes(order.status) && <form onSubmit={form(async d => {
        setBusy(true); setError('');
        try { await api(path + '/payments', { method: 'POST', body: JSON.stringify({ amount: d.get('amount'), method: d.get('method'), idempotencyKey: paymentKey }) }); setPaymentKey(crypto.randomUUID()); await load(); } catch(e) { fail(e); } finally { setBusy(false); }
      })}><label>Summa<input name="amount" type="number" min=".01" step=".01" required /></label><label>Usul<select name="method">{['CASH','CARD','CLICK','PAYME','TRANSFER','OTHER'].map(m => <option key={m}>{m}</option>)}</select></label><button disabled={busy}>To‘lov qabul qilish</button></form>}
    </section>}
    {order.status === 'READY' && can('orders.edit') && <section><h2>Mijozga topshirish</h2><form onSubmit={form(d => action('/deliver', { warrantyDays: Number(d.get('days')), warrantyTerms: d.get('terms') }))}><label>Kafolat (kun)<input name="days" type="number" min="1" max="1095" defaultValue="90" required /></label><label>Kafolat shartlari<textarea name="terms" minLength={5} required /></label><button disabled={busy}>Qurilmani topshirish</button></form></section>}
    </div>
  </main>;
}
