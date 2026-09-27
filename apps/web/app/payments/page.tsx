'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { dateTime, money, PAYMENT_METHODS, today } from '../../lib/format';
import { AppShell } from '../../components/layout/app-shell';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';
import { List, ListRow } from '../../components/list-row';

type Row = { id: string; kind: 'PAYMENT' | 'REFUND'; amount: string; method: string; reason?: string | null; createdAt: string; order: { id: string; number: string; customer: { firstName: string } } };
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(iso));

export default function Payments() {
  const { data, isLoading, error } = useQuery({ queryKey: ['payments'], queryFn: () => api<Row[]>('/payments') });
  const todayTotal = (data ?? []).filter(p => dayOf(p.createdAt) === today()).reduce((s, p) => s + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount), 0);
  return (
    <AppShell title="To'lovlar" narrow>
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={6} /> : !data?.length ? <Empty title="Hali to'lov yo'q" /> : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4"><p className="eyebrow">Bugun</p><p className="num mt-1 font-mono text-2xl font-semibold">{money(todayTotal)} <span className="text-sm font-normal text-mute">so&apos;m</span></p></div>
          <List>
            {data.map(p => (
              <ListRow key={p.id} href={`/orders/${p.order.id}`}
                title={<>{p.order.customer.firstName} <span className="num font-mono text-xs font-normal text-mute">{p.order.number}</span></>}
                sub={`${dateTime(p.createdAt)} · ${p.kind === 'REFUND' ? 'Qaytarildi' + (p.reason ? ': ' + p.reason : '') : PAYMENT_METHODS[p.method] ?? p.method}`}
                right={<span className={p.kind === 'REFUND' ? 'text-red-600' : ''}>{p.kind === 'REFUND' ? '−' : ''}{money(p.amount)}</span>} />
            ))}
          </List>
        </div>
      )}
    </AppShell>
  );
}
