'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { fullName, phone } from '../../lib/format';
import type { Customer } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Input } from '../../components/ui/input';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';

export default function Customers() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const { data, isLoading, error } = useQuery({
    queryKey: ['customers', 'list', query],
    queryFn: () => api<Customer[]>('/customers' + (query ? '?q=' + encodeURIComponent(query.replace(/^\+?998/, '')) : '')),
    placeholderData: prev => prev,
  });
  return (
    <AppShell title="Mijozlar" narrow>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ism yoki telefon" type="search" className="mb-4" autoComplete="off" />
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={6} /> : !data?.length ? (
        <Empty title={query ? 'Topilmadi' : "Hali mijoz yo'q"}>Mijoz birinchi qabulda avtomatik qo&apos;shiladi.</Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-white">
          {data.map(c => (
            <li key={c.id}>
              <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{fullName(c)}</p>
                  <p className="truncate text-xs text-mute"><span className="num font-mono">{phone(c.phone)}</span>{c.devices?.length ? ' · ' + c.devices.map(d => d.model).join(', ') : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
