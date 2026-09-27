'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { phone } from '../../lib/format';
import { AppShell } from '../../components/layout/app-shell';
import { Input } from '../../components/ui/input';
import { StatusBadge } from '../../components/ui/status-badge';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';

type Hit = { id: string; number: string; status: string; customer: { firstName: string; phone: string }; device: { brand: string; model: string } };

export default function Search() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim().replace(/^\+?998\s?/, '')), 250); return () => clearTimeout(t); }, [q]);
  const { data, isFetching, error } = useQuery({ queryKey: ['search', query], queryFn: () => api<Hit[]>('/search?q=' + encodeURIComponent(query)), enabled: query.length >= 2 });
  return (
    <AppShell title="Qidirish" narrow>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buyurtma raqami, telefon, ism yoki model" type="search" autoFocus className="mb-4" />
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : query.length < 2 ? <p className="text-sm text-mute">Kamida 2 belgi yozing.</p> : isFetching && !data ? <Loading /> : !data?.length ? <Empty title="Hech narsa topilmadi" /> : (
        <List>
          {data.map(o => (
            <ListRow key={o.id} href={`/orders/${o.id}`} title={`${o.device.brand} ${o.device.model} · ${o.customer.firstName}`}
              sub={<span className="num font-mono">{o.number} · {phone(o.customer.phone)}</span>} right={<StatusBadge status={o.status} />} />
          ))}
        </List>
      )}
    </AppShell>
  );
}
