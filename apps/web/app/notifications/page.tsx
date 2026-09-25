'use client';
import Link from 'next/link';
import { useNotifications } from '../../lib/queries';
import { Badge } from '../../components/ui/badge';
import { AppShell } from '../../components/layout/app-shell';

export default function Notifications() {
  const { data: notifications = [], isLoading } = useNotifications();

  return (
    <AppShell title="Xabarnomalar" subtitle="Yetkazib berish tarixi">

      <section>
        {isLoading ? <p className="muted">Yuklanmoqda...</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Vaqt</th><th>Turi</th><th>Kanal</th><th>Holat</th><th>Buyurtma</th><th>Xato</th></tr></thead>
              <tbody>
                {notifications.map(n => (
                  <tr key={n.id}>
                    <td style={{ fontSize: 13 }}>{new Date(n.sentAt ?? n.createdAt).toLocaleString('uz-UZ')}</td>
                    <td style={{ fontSize: 13 }}>{n.type}</td>
                    <td><Badge variant="default">{n.channel ?? '—'}</Badge></td>
                    <td>
                      <Badge variant={n.status === 'SENT' ? 'success' : n.status === 'FAILED' ? 'danger' : 'warning'}>
                        {n.status}
                      </Badge>
                    </td>
                    <td><Link href={'/orders/' + (n as any).orderId}>Ochish</Link></td>
                    <td style={{ fontSize: 12, color: '#999' }}>{(n as any).errorCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {notifications.length === 0 && <p className="muted">Xabarnomalar hali yaratilmagan.</p>}
          </div>
        )}
      </section>
    </AppShell>
  );
}
