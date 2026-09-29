'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { errorText } from '../lib/errors';
import { dateTime, money } from '../lib/format';
import { invalidateBusiness } from '../lib/queries';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ErrorBox } from './ui/feedback';

export type SourcedPart = {
  id: string; name: string; shop: string; cost: string; status: 'TAKEN' | 'PAID' | 'RETURNED'; note?: string | null; createdAt: string; settledAt?: string | null;
  order?: { id: string; number: string; status: string; device: { brand: string; model: string }; customer: { firstName: string } } | null;
};
export const PART_STATUS: Record<string, [string, 'warning' | 'success' | 'outline']> = { TAKEN: ["To'lanmagan", 'warning'], PAID: ["To'langan", 'success'], RETURNED: ['Qaytarilgan', 'outline'] };

/** A part taken on credit, with the two ways it is settled: paid to the shop or given back. */
export function PartRow({ part, canEdit, compact }: { part: SourcedPart; canEdit: boolean; compact?: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, variant] = PART_STATUS[part.status] ?? [part.status, 'outline' as const];
  async function settle(action: 'pay' | 'return') {
    setBusy(true); setError('');
    try { await api(`/parts/${part.id}/${action}`, { method: 'POST' }); await invalidateBusiness(qc); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <li className={cn('bg-white', compact ? 'px-4 py-3' : 'rounded-lg border p-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{part.name}</p>
          <p className="truncate text-xs text-mute">{part.shop} · {dateTime(part.createdAt)}</p>
          {!compact && part.order && <Link href={`/orders/${part.order.id}`} className="num mt-0.5 block truncate font-mono text-xs text-mute underline">{part.order.number} · {part.order.device.brand} {part.order.device.model}</Link>}
        </div>
        <div className="shrink-0 text-right">
          <p className="num font-mono text-sm font-semibold">{money(part.cost)}</p>
          <Badge variant={variant} className="mt-1">{label}</Badge>
        </div>
      </div>
      {canEdit && part.status === 'TAKEN' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => settle('pay')}><Check className="h-4 w-4" /> Pulini berdim</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => settle('return')}><Undo2 className="h-4 w-4" /> Qaytardim</Button>
        </div>
      )}
      <ErrorBox className="mt-2">{error}</ErrorBox>
    </li>
  );
}
