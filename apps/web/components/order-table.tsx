import Link from 'next/link';
import { dateTime, daysSince, deviceName, fullName, money } from '../lib/format';
import { paidOf, type Order } from '../lib/queries';
import { cn } from '../lib/utils';
import { StatusBadge } from './ui/status-badge';
import { LATE_AFTER, Ruler, rulerKind } from './ui/ruler';

const COLS = 'grid-cols-[9.5rem_minmax(0,1fr)_11rem_7rem_7.5rem_7rem]';

/** Desktop orders table: number, device and customer, days in the shop, stamp, total, what is still owed. */
export function OrderTable({ orders }: { orders: Order[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white">
      <div className={cn('grid border-b text-xs font-medium text-mute', COLS)}>
        <span className="px-4 py-3">Raqam</span><span className="px-3 py-3">Qurilma, mijoz</span><span className="px-3 py-3">Ustaxonada</span>
        <span className="px-3 py-3">Holat</span><span className="px-3 py-3 text-right">Jami</span><span className="px-4 py-3 text-right">Qoldiq</span>
      </div>
      <ul>
        {orders.map(o => {
          const paid = paidOf(o.payments);
          const balance = Number(o.total) - paid;
          const owed = balance > 0 && o.status !== 'CANCELLED' && (paid > 0 || o.status === 'DELIVERED');
          const kind = rulerKind(o.status);
          const days = daysSince(o.createdAt);
          const late = kind === 'tayyor' && days > LATE_AFTER;
          return (
            <li key={o.id} className="border-b border-paper last:border-0">
              <Link href={`/orders/${o.id}`} className={cn('grid min-h-[3.75rem] items-center transition-colors hover:bg-[#F3F7F6]', COLS)}>
                <span className="num px-4 font-mono text-xs">{o.number}</span>
                <span className="min-w-0 px-3">
                  <span className="block truncate text-sm font-semibold">{deviceName(o.device)}</span>
                  <span className="block truncate text-xs text-mute">{fullName(o.customer)} · {o.complaint}</span>
                </span>
                <span className="flex items-end gap-2 px-3">
                  {kind ? <>
                    <Ruler days={days} kind={kind} />
                    <span className={cn('num font-mono text-[11px] font-semibold leading-none', late ? 'text-st-kutish-ink' : 'text-mute')}>{days} kun</span>
                  </> : <span className="text-xs text-mute">{dateTime(o.createdAt)}</span>}
                </span>
                <span className="px-3"><StatusBadge status={o.status} late={late} /></span>
                <span className="num px-3 text-right font-mono text-[13px]">{Number(o.total) > 0 ? money(o.total) : '—'}</span>
                <span className={cn('num px-4 text-right font-mono text-[13px] font-semibold', owed && 'text-amber-700')}>{owed ? money(balance) : ''}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
