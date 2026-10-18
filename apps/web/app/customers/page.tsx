'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { fullName, initials, phone } from '../../lib/format';
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
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" aria-hidden="true" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Ism yoki telefon" type="search" className="h-12 rounded-2xl pl-10 lg:h-11" autoComplete="off" aria-label="Mijozlardan qidirish" />
      </div>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={6} /> : !data?.length ? (
        <Empty title={query ? 'Topilmadi' : "Hali mijoz yo'q"}>Mijoz birinchi qabulda avtomatik qo&apos;shiladi.</Empty>
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-white">
            {data.map(c => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#F3F7F6] active:bg-paper">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-[13px] font-semibold">{initials(c)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">{fullName(c)}{c.telegramChatId && <Send className="h-3.5 w-3.5 shrink-0 text-st-tamir" aria-label="Telegram ulangan" />}</p>
                    <p className="truncate text-[13px] text-mute"><span className="num font-mono text-xs">{phone(c.phone)}</span>{c.devices?.length ? ' · ' + c.devices.map(d => d.model).join(', ') : ''}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-mute">{data.length} ta mijoz{data.length >= 50 ? ' · qidiruv bilan toraytiring' : ''}</p>
        </>
      )}
    </AppShell>
  );
}
