'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, apiBlob } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { useState } from 'react';

type Finance = { revenue: string; received: string; refunds: string; netCash: string; partCost: string; operatingExpenses: string; contributionAfterExpenses: string; basis: string };
type Tech = { id: string; firstName: string; assigned: number; completed: number; repairSeconds: number };

export default function Reports() {
  const router = useRouter();
  const [range, setRange] = useState('');

  const { data: finance, refetch: refetchFinance } = useQuery<Finance>({
    queryKey: ['reports', 'finance', range],
    queryFn: () => api('/reports/finance' + range),
  });
  const { data: tech = [] } = useQuery<Tech[]>({
    queryKey: ['reports', 'technicians'],
    queryFn: () => api('/reports/technicians'),
  });

  function preset(days: number) {
    const to = new Date(), from = new Date();
    from.setDate(to.getDate() - days + 1);
    setRange('?from=' + from.toISOString().slice(0, 10) + '&to=' + to.toISOString().slice(0, 10));
  }

  async function download() {
    try {
      const blob = await apiBlob('/reports/export' + range);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'myservice-orders.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  }

  const METRICS: [string, keyof Finance][] = [
    ['Tushum', 'revenue'], ['Kelgan pul', 'received'], ['Refund', 'refunds'],
    ['Sof pul oqimi', 'netCash'], ['Detal tannarxi', 'partCost'],
    ['Operatsion xarajat', 'operatingExpenses'], ['Hissa', 'contributionAfterExpenses'],
  ];

  return (
    <main className="page">
      <header><Link href="/dashboard" className="brand">MY SERVICE</Link><Link href="/orders">Buyurtmalar</Link></header>
      <div className="title-row">
        <div><p className="eyebrow">NATIJALAR</p><h1>Hisobotlar</h1></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => preset(1)}>Bugun</Button>
          <Button variant="secondary" size="sm" onClick={() => preset(7)}>7 kun</Button>
          <Button variant="secondary" size="sm" onClick={() => preset(30)}>30 kun</Button>
          <Button variant="secondary" size="sm" onClick={download}>CSV eksport</Button>
        </div>
      </div>

      <form className="inline-form" style={{ marginBottom: 24 }} onSubmit={e => {
        e.preventDefault();
        const d = new FormData(e.currentTarget as HTMLFormElement);
        setRange('?from=' + d.get('from') + '&to=' + d.get('to'));
      }}>
        <input name="from" type="date" required style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8 }} />
        <input name="to" type="date" required style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8 }} />
        <Button type="submit" variant="secondary" size="sm">Ko'rsatish</Button>
      </form>

      {finance && (
        <>
          <div className="cards" style={{ marginBottom: 24 }}>
            {METRICS.map(([label, key]) => (
              <Card key={key}>
                <p className="muted" style={{ fontSize: 12 }}>{label}</p>
                <strong style={{ fontSize: 26, display: 'block', marginTop: 8 }}>
                  {Number(finance[key]).toLocaleString('uz-UZ')}
                </strong>
              </Card>
            ))}
          </div>
          <p className="muted" style={{ marginBottom: 24, fontSize: 13 }}>{finance.basis}</p>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Ustalar</CardTitle></CardHeader>
        <CardContent>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Usta</th><th>Biriktirilgan</th><th>Topshirilgan</th><th>Ish vaqti</th></tr></thead>
              <tbody>
                {tech.map(t => (
                  <tr key={t.id}>
                    <td><Link href={'/staff/' + t.id}>{t.firstName}</Link></td>
                    <td>{t.assigned}</td>
                    <td>{t.completed}</td>
                    <td>{Math.round(t.repairSeconds / 60)} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tech.length === 0 && <p className="muted">Ma'lumot yo'q.</p>}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
