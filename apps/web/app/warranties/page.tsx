'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorText } from '../../lib/errors';
import { date } from '../../lib/format';
import { can, useMe } from '../../lib/queries';
import { AppShell } from '../../components/layout/app-shell';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Empty, ErrorBox, Loading } from '../../components/ui/feedback';

type Warranty = { id: string; endDate: string; order: { id: string; number: string; customer: { firstName: string; phone: string }; device: { brand: string; model: string } } };

export default function Warranties() {
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery({ queryKey: ['warranties'], queryFn: () => api<Warranty[]>('/warranties') });
  const [q, setQ] = useState('');
  const text = q.trim().toLowerCase();
  const shown = (data ?? []).filter(w => !text || w.order.number.toLowerCase().includes(text) || w.order.customer.firstName.toLowerCase().includes(text) || w.order.customer.phone.includes(text.replace(/\D/g, '') || '§'));
  return (
    <AppShell title="Kafolatlar" narrow>
      <p className="mb-3 text-sm text-mute">Mijoz kafolat bilan qaytsa, shu yerdan bepul qabul qiling.</p>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Raqam, ism yoki telefon" type="search" className="mb-4" />
      {error ? <ErrorBox>{errorText(error)}</ErrorBox> : isLoading ? <Loading rows={4} /> : !shown.length ? <Empty title="Kafolat topilmadi" /> : (
        <ul className="space-y-2">{shown.map(w => <WarrantyRow key={w.id} w={w} canClaim={can(me, 'orders.create')} />)}</ul>
      )}
    </AppShell>
  );
}

function WarrantyRow({ w, canClaim }: { w: Warranty; canClaim: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = new Date(w.endDate) > new Date();
  async function claim() {
    setBusy(true); setError('');
    try { const o = await api<{ id: string }>(`/warranties/${w.id}/claim`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) }); router.push('/orders/' + o.id); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{w.order.device.brand} {w.order.device.model} <span className="font-normal text-mute">· {w.order.customer.firstName}</span></p>
          <p className="num font-mono text-xs text-mute">{w.order.number}</p>
        </div>
        <Badge variant={active ? 'success' : 'outline'}>{active ? date(w.endDate) + ' gacha' : 'Tugagan'}</Badge>
      </div>
      {active && canClaim && !open && <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>Kafolat bo&apos;yicha qabul</Button>}
      {open && (
        <div className="mt-3 space-y-2">
          <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Nima bo'ldi? (masalan: ekran yana miltillayapti)" autoFocus />
          <ErrorBox>{error}</ErrorBox>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Bekor</Button>
            <Button size="sm" disabled={busy || reason.trim().length < 3} onClick={claim}>Qabul qilish</Button>
          </div>
        </div>
      )}
    </li>
  );
}
