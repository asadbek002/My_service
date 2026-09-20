'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearAccess, logout } from '../lib/api';

type Me = { id: string; firstName: string; login: string; mustChangePassword: boolean; permissions: string[] };
type Staff = { id: string; firstName: string; login: string; phone: string; status: string };
type Branch = { id: string; name: string };
export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState('overview');
  function fail(e: unknown) {
    if (e instanceof Error && e.message === 'SESSION_EXPIRED') router.replace('/login');
    else setError(e instanceof Error ? e.message : 'Ulanishda xato');
  }
  async function loadStaff() { setStaff(await api<Staff[]>('/staff')); }
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener('online', update); window.addEventListener('offline', update);
    api<Me>('/auth/me').then(async user => {
      setMe(user);
      if (!user.mustChangePassword) {
        setBranches(await api<Branch[]>('/branches'));
        if (user.permissions.includes('staff.view')) await loadStaff();
      }
    }).catch(fail);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }) });
      clearAccess(); router.replace('/login');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError('');
    try {
      await api('/staff', { method: 'POST', body: JSON.stringify({
        login: data.get('login'), firstName: data.get('firstName'), phone: data.get('phone'),
        temporaryPassword: data.get('temporaryPassword'), role: data.get('role'), branchIds: [data.get('branchId')],
      }) });
      form.reset(); await loadStaff();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function status(user: Staff) {
    setBusy(true); setError('');
    try {
      await api('/staff/' + user.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }) });
      await loadStaff();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  if (!me) return <main className="auth-page"><p role="status">{error || 'Yuklanmoqda…'}</p></main>;
  if (me.mustChangePassword) return <main className="auth-page"><section className="auth-card">
    <p className="eyebrow">HISOB XAVFSIZLIGI</p><h2>Yangi parol yarating</h2>
    <p className="muted">Birinchi kirishda vaqtinchalik parolni almashtiring. Keyin qayta kirasiz.</p>
    <form onSubmit={change}>
      <label>Hozirgi parol<input type="password" name="currentPassword" autoComplete="current-password" required /></label>
      <label>Yangi parol<input type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
      <p className="muted">Kamida 12 belgi.</p>{error && <p role="alert" className="error">{error}</p>}
      <button disabled={busy || !online}>Parolni saqlash</button>
    </form>
  </section></main>;
  return <div className="workspace">
    <aside><a href="/dashboard" className="brand">MY SERVICE</a><p className="eyebrow">PREMIUM REPAIR</p>
      <nav aria-label="Asosiy menyu">{me.permissions.includes('orders.view') && <><a className="nav-link" href="/orders">Buyurtmalar</a><a className="nav-link" href="/search">Qidiruv</a></>}{me.permissions.includes('inventory.view') && <a className="nav-link" href="/inventory">Ombor</a>}{me.permissions.includes('reports.view') && <a className="nav-link" href="/reports">Hisobotlar</a>}{me.permissions.includes('reports.finance') && <a className="nav-link" href="/expenses">Xarajatlar</a>}{me.permissions.includes('settings.manage') && <a className="nav-link" href="/settings">Sozlamalar</a>}<button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Bosh sahifa</button>
      {me.permissions.includes('staff.view') && <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>Xodimlar</button>}</nav>
      <button className="secondary" onClick={() => { logout().then(() => router.replace('/login')).catch(fail); }}>Chiqish</button>
    </aside>
    <div className="content"><header><span>{tab === 'staff' ? 'Xodimlar' : 'Bosh sahifa'}</span><span>{me.firstName}</span></header>
      {!online && <p role="alert" className="error">Internet yo‘q. O‘zgarishlarni saqlash uchun qayta ulaning.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {tab === 'overview' ? <><p className="eyebrow">ISH JOYINGIZ</p><h1>Xush kelibsiz, {me.firstName}.</h1>
        <div className="cards"><section><span className="muted">Sizga ochiq filiallar</span><strong>{branches.length}</strong></section>
        {me.permissions.includes('staff.view') && <section><span className="muted">Faol xodimlar</span><strong>{staff.filter(s => s.status === 'ACTIVE').length}</strong></section>}</div>
        <section><h2>Filiallar</h2>{branches.map(b => <p key={b.id}>{b.name}</p>)}</section></>
      : <><h1>Jamoa boshqaruvi</h1><div className="staff-layout"><section>
        <h2>Xodimlar</h2><div className="table-scroll"><table><thead><tr><th>Ism</th><th>Login</th><th>Holat</th><th>Amal</th></tr></thead>
        <tbody>{staff.map(user => <tr key={user.id}><td>{user.firstName}</td><td>{user.login}</td><td>{user.status}</td><td>
        {me.permissions.includes('staff.manage') && user.id !== me.id && <button className="secondary" disabled={busy || !online} onClick={() => status(user)}>{user.status === 'ACTIVE' ? 'To‘xtatish' : 'Faollashtirish'}</button>}
        </td></tr>)}</tbody></table></div>
      </section>{me.permissions.includes('staff.manage') && <section><h2>Xodim qo‘shish</h2><form onSubmit={create}>
        <label>Ism<input name="firstName" required maxLength={100} /></label>
        <label>Telefon<input name="phone" type="tel" placeholder="+998901234567" required /></label>
        <label>Login<input name="login" required minLength={3} maxLength={64} autoComplete="off" /></label>
        <label>Vaqtinchalik parol<input name="temporaryPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>
        <label>Lavozim<select name="role"><option value="TECHNICIAN">Usta</option><option value="MANAGER">Manager</option><option value="ADMIN">Administrator</option></select></label>
        <label>Filial<select name="branchId" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <button disabled={busy || !online}>Xodim yaratish</button>
      </form></section>}</div></>}
    </div>
  </div>;
}
