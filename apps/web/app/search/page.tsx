'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { StatusBadge } from '../../components/ui/status-badge';
import { AppShell } from '../../components/layout/app-shell';

type SearchResult = { orders: { id: string; number: string; status: string; customer: { firstName: string; phone: string }; device: { brand: string; model: string } }[]; customers: { id: string; firstName: string; phone: string }[] };

export default function Search() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ['search', submitted],
    queryFn: () => api('/search?q=' + encodeURIComponent(submitted)),
    enabled: submitted.length >= 2,
  });

  return (
    <AppShell title="Global qidirish" subtitle="Qidirish">

      <form className="search-form" onSubmit={e => { e.preventDefault(); setSubmitted(q); }}>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Telefon, ism, buyurtma raqami, IMEI..." autoFocus />
        <Button type="submit" disabled={q.length < 2}>Qidirish</Button>
      </form>

      {isLoading && <p className="muted">Qidirilmoqda...</p>}

      {data && (
        <>
          {data.orders.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2>Buyurtmalar ({data.orders.length})</h2>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Raqam</th><th>Mijoz</th><th>Qurilma</th><th>Holat</th></tr></thead>
                  <tbody>
                    {data.orders.map(o => (
                      <tr key={o.id}>
                        <td><Link href={'/orders/' + o.id}>{o.number}</Link></td>
                        <td>{o.customer.firstName}<small>{o.customer.phone}</small></td>
                        <td>{o.device.brand} {o.device.model}</td>
                        <td><StatusBadge status={o.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {data.customers.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h2>Mijozlar ({data.customers.length})</h2>
              {data.customers.map(c => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #eee', fontSize: 14 }}>
                  <Link href={'/customers/' + c.id}>{c.firstName}</Link>
                  <small style={{ marginLeft: 8, color: '#666' }}>{c.phone}</small>
                </div>
              ))}
            </section>
          )}
          {data.orders.length === 0 && data.customers.length === 0 && (
            <p className="muted" style={{ marginTop: 24 }}>"{submitted}" bo'yicha hech narsa topilmadi.</p>
          )}
        </>
      )}
    </AppShell>
  );
}
