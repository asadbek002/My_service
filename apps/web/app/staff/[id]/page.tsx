'use client';
import Link from 'next/link';
import { use } from 'react';
import { useStaff, useStaffActivity, useStaffActive } from '../../../lib/queries';
import { StatusBadge } from '../../../components/ui/status-badge';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';

export default function StaffDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: staffList = [] } = useStaff();
  const { data: activity = [], isLoading: actLoading } = useStaffActivity(id);
  const { data: activeData } = useStaffActive(id, 5);

  const user = staffList.find(u => u.id === id);

  return (
    <main className="page">
      <header>
        <Link href="/dashboard" className="brand">MY SERVICE</Link>
        <Link href="/staff">← Xodimlar</Link>
      </header>

      {user && (
        <div className="title-row">
          <div>
            <p className="eyebrow">XODIM</p>
            <h1>{user.firstName}</h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <StatusBadge status={user.status} />
            {activeData && (
              <Badge variant={activeData.active ? 'success' : 'warning'}>
                {activeData.active ? '🟢 Faol (5 kun)' : '🟡 Faol emas (5 kun)'}
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="detail-grid">
        {user && (
          <Card>
            <CardHeader><CardTitle>Ma'lumotlar</CardTitle></CardHeader>
            <CardContent>
              <table style={{ width: '100%', fontSize: 14 }}>
                <tbody>
                  <tr><td className="muted" style={{ padding: '8px 0' }}>Login</td><td>{user.login}</td></tr>
                  <tr><td className="muted" style={{ padding: '8px 0' }}>Telefon</td><td>{user.phone}</td></tr>
                  <tr><td className="muted" style={{ padding: '8px 0' }}>Lavozim</td><td>{user.roles.map(r => r.role.name).join(', ')}</td></tr>
                  <tr><td className="muted" style={{ padding: '8px 0' }}>Filiallar</td><td>{user.branches.map(b => b.branch.name).join(', ')}</td></tr>
                </tbody>
              </table>
              {activeData && (
                <div style={{ marginTop: 16, padding: 12, background: '#f9f9f7', borderRadius: 8, fontSize: 13 }}>
                  <strong>So'nggi 5 kun faollik:</strong>
                  <div style={{ marginTop: 4, color: '#555' }}>
                    Audit hodisalar: {activeData.auditEvents} | Buyurtma hodisalar: {activeData.orderEvents}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>Faollik tarixi</CardTitle></CardHeader>
          <CardContent>
            {actLoading ? <p className="muted">Yuklanmoqda...</p> : (
              <ul className="timeline" style={{ maxHeight: 400, overflowY: 'auto' }}>
                {activity.slice(0, 50).map(a => (
                  <li key={a.entityId + a.action}>
                    <p style={{ fontSize: 12, color: '#777' }}>{new Date(a.createdAt).toLocaleString('uz-UZ')}</p>
                    <p style={{ fontSize: 13 }}>{a.action}{a.entityId ? ` — ${a.entityId.slice(0, 8)}` : ''}</p>
                  </li>
                ))}
                {activity.length === 0 && <li><p className="muted">Hozircha faollik yo'q.</p></li>}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
