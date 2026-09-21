'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe, useDashboard, useOrders, useStaff } from '../../lib/queries';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema, type ChangePasswordInput } from '../../lib/schemas';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FormField } from '../../components/ui/form-field';
import { StatusBadge } from '../../components/ui/status-badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { api, clearAccess, logout } from '../../lib/api';

export default function Dashboard() {
  const router = useRouter();
  const { data: me, error: meError } = useMe();
  const { data: report } = useDashboard();
  const { data: orders = [] } = useOrders();
  const { data: staff = [] } = useStaff();

  const pwForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  if (meError?.message === 'SESSION_EXPIRED') { router.replace('/login'); return null; }

  async function onChangePassword(data: ChangePasswordInput) {
    await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: data.currentPassword, newPassword: data.newPassword }) });
    clearAccess();
    router.replace('/login');
  }

  async function onLogout() {
    try { await logout(); } finally { router.replace('/login'); }
  }

  // Parol o'zgartirish majburiy bo'lsa
  if (me?.mustChangePassword) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Parolni yangilang</h1>
          <p className="muted" style={{ marginTop: 8 }}>Xavfsizlik uchun vaqtinchalik parolni o'zgartiring.</p>
          <form onSubmit={pwForm.handleSubmit(onChangePassword)} style={{ marginTop: 28 }}>
            <div className="grid gap-4">
              <FormField label="Joriy parol" error={pwForm.formState.errors.currentPassword?.message} required>
                <Input {...pwForm.register('currentPassword')} type="password" />
              </FormField>
              <FormField label="Yangi parol" error={pwForm.formState.errors.newPassword?.message} required>
                <Input {...pwForm.register('newPassword')} type="password" placeholder="Kamida 12 belgi" />
              </FormField>
              <FormField label="Yangi parolni takrorlang" error={pwForm.formState.errors.confirmPassword?.message} required>
                <Input {...pwForm.register('confirmPassword')} type="password" />
              </FormField>
              {pwForm.formState.errors.root && <p className="error">{pwForm.formState.errors.root.message}</p>}
              <Button type="submit" disabled={pwForm.formState.isSubmitting}>Parolni yangilash</Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const recentOrders = orders.slice(0, 8);

  return (
    <main className="page">
      <header>
        <span className="brand">MY SERVICE</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 14 }}>
          {me?.firstName}
          <Button variant="secondary" size="sm" onClick={onLogout}>Chiqish</Button>
        </div>
      </header>

      <div className="title-row">
        <div><p className="eyebrow">BOSHQARUV PANELI</p><h1>Dashboard</h1></div>
        {me?.permissions.includes('orders.create') && (
          <Link href="/orders?new=1"><Button>+ Yangi qabul</Button></Link>
        )}
      </div>

      {/* Statistika kartalar */}
      {report && (
        <div className="cards" style={{ marginBottom: 32 }}>
          <Card>
            <p className="muted">Bugun qabul</p>
            <strong style={{ fontSize: 40, display: 'block', marginTop: 8 }}>{report.todayReceived}</strong>
          </Card>
          {report.statuses?.map(s => (
            <Card key={s.status}>
              <StatusBadge status={s.status} />
              <strong style={{ fontSize: 40, display: 'block', marginTop: 8 }}>{s.count}</strong>
            </Card>
          ))}
          {report.todayCash && (
            <Card>
              <p className="muted">Bugungi tushum</p>
              <strong style={{ fontSize: 28, display: 'block', marginTop: 8 }}>{Number(report.todayCash).toLocaleString('uz-UZ')}</strong>
            </Card>
          )}
          {report.debt && (
            <Card>
              <p className="muted">Qarzdorlik</p>
              <strong style={{ fontSize: 28, display: 'block', marginTop: 8, color: '#a32b2b' }}>{Number(report.debt).toLocaleString('uz-UZ')}</strong>
            </Card>
          )}
        </div>
      )}

      <div className="detail-grid">
        {/* So'nggi buyurtmalar */}
        <Card>
          <CardHeader><CardTitle>So'nggi buyurtmalar</CardTitle></CardHeader>
          <CardContent>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Raqam</th><th>Qurilma</th><th>Holat</th></tr></thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id}>
                      <td><Link href={'/orders/' + o.id}>{o.number}</Link></td>
                      <td>{o.device.brand} {o.device.model}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentOrders.length === 0 && <p className="muted">Buyurtmalar yo'q</p>}
            </div>
            <div style={{ marginTop: 16 }}>
              <Link href="/orders"><Button variant="secondary" size="sm">Barchasi →</Button></Link>
            </div>
          </CardContent>
        </Card>

        {/* Ustalar ish yuki */}
        {report?.workload && report.workload.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Ustalar</CardTitle></CardHeader>
            <CardContent>
              {report.workload.map(w => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #eee', fontSize: 14 }}>
                  <span>{w.name}</span>
                  <span className="muted">{w.active} ta faol</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Kam detal */}
        {report?.lowStock && report.lowStock.length > 0 && (
          <Card>
            <CardHeader><CardTitle>⚠️ Kam detal</CardTitle></CardHeader>
            <CardContent>
              {report.lowStock.map(s => (
                <div key={s.partId} style={{ padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                  <strong>{s.name}</strong>
                  <p className="muted">{s.branch} · {s.free} dona qoldi (min: {s.minimum})</p>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <Link href="/inventory"><Button variant="secondary" size="sm">Omborga o'tish →</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 7 kunlik grafik */}
        {report?.revenueByDay && report.revenueByDay.length > 0 && (
          <Card>
            <CardHeader><CardTitle>7 kunlik tushum</CardTitle></CardHeader>
            <CardContent>
              {report.revenueByDay.map(d => {
                const max = Math.max(...report.revenueByDay!.map(x => Number(x.revenue)));
                const pct = max > 0 ? Math.round(Number(d.revenue) / max * 100) : 0;
                return (
                  <div key={d.day} className="chart-row">
                    <span>{d.day.slice(5)}</span>
                    <i style={{ width: pct + '%' }} />
                    <b>{Number(d.revenue).toLocaleString('uz-UZ')}</b>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Navigatsiya */}
      <div className="workspace" style={{ marginTop: 40 }}>
        <aside>
          <span className="brand">MY SERVICE</span>
          <nav>
            {[
              ['/orders', 'Buyurtmalar'],
              ['/customers', 'Mijozlar'],
              ['/staff', 'Xodimlar'],
              ['/inventory', 'Ombor'],
              ['/payments', 'To\'lovlar'],
              ['/expenses', 'Xarajatlar'],
              ['/warranties', 'Kafolatlar'],
              ['/reports', 'Hisobotlar'],
              ['/notifications', 'Xabarnomalar'],
              ['/settings', 'Sozlamalar'],
            ].map(([href, label]) => (
              <Link key={href} href={href}>
                <button className="nav-link" style={{ width: '100%', textAlign: 'left' }}>{label}</button>
              </Link>
            ))}
          </nav>
          <Button variant="secondary" size="sm" onClick={onLogout}>Chiqish</Button>
        </aside>
      </div>
    </main>
  );
}
