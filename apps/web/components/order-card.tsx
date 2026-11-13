import Link from 'next/link';
import { Flame, Truck } from 'lucide-react';
import { COURIERS, dateTime, daysSince, deviceName, fullName, money } from '../lib/format';
import { paidOf, type Order } from '../lib/queries';
import { cn } from '../lib/utils';
import { useCurrentBranch } from '../lib/branches';
import { StatusBadge, statusLabel } from './ui/status-badge';
import { LATE_AFTER, Ruler, rulerKind } from './ui/ruler';

const STATE_INK: Record<string, string> = { qabul: 'text-st-qabul-ink', tamir: 'text-st-tamir-ink', tayyor: 'text-st-tayyor-ink' };

/** One order: device and money on top, who and which ticket below, the ruler of days in the shop at the bottom. */
export function OrderCard({ order, flat }: { order: Order; flat?: boolean }) {
  const paid = paidOf(order.payments);
  const balance = Number(order.total) - paid;
  const debt = balance > 0 && order.status === 'DELIVERED';
  const partial = !debt && balance > 0 && paid > 0 && order.status !== 'CANCELLED';
  const kind = rulerKind(order.status);
  const days = daysSince(order.createdAt);
  const late = kind === 'tayyor' && days > LATE_AFTER;
  // In "all branches" every card says where the device is.
  const { multi, branch } = useCurrentBranch();
  const where = multi && !branch ? order.branch?.name : null;
  // Urgent work stands out until the device is handed over.
  const urgent = !!order.urgent && ['RECEIVED', 'IN_REPAIR', 'READY'].includes(order.status);
  return (
    <Link href={`/orders/${order.id}`} className={cn('block px-4 py-3.5 transition-colors active:bg-paper', urgent ? 'border-l-4 border-l-red-600 bg-red-50 hover:bg-red-100/70' : 'bg-white', flat ? (urgent ? '' : 'hover:bg-[#F3F7F6]') : 'rounded-xl border hover:border-ink/30')}>
      {(urgent || order.intake === 'POST') && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {urgent && <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"><Flame className="h-3 w-3" />Shoshilinch</span>}
          {order.intake === 'POST' && <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold text-ink/80"><Truck className="h-3 w-3" />Pochta{order.courier ? ' · ' + (COURIERS[order.courier] ?? order.courier) : ''}</span>}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{deviceName(order.device)}</p>
          <p className="truncate text-[13px] text-mute">{fullName(order.customer)} · <span className="num font-mono text-xs">{order.number}</span>{where && <> · {where}</>}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num font-mono text-sm font-semibold">{Number(order.total) > 0 ? money(order.total) : '—'}</p>
          {debt && <p className="num font-mono text-xs font-semibold text-amber-700">qarz {money(balance)}</p>}
          {partial && <p className="num font-mono text-xs font-semibold text-amber-700">qoldiq {money(balance)}</p>}
        </div>
      </div>
      <p className="mt-1 line-clamp-1 text-[13px] text-ink/80">{order.complaint}</p>
      <div className="mt-2.5 flex items-end justify-between gap-3">
        {kind ? (
          <span className="flex items-end gap-2.5">
            <Ruler days={days} kind={kind} />
            <span className={cn('text-xs font-semibold leading-none', late ? 'text-st-kutish-ink' : STATE_INK[kind])}>{statusLabel(order.status)} · {days} kun</span>
          </span>
        ) : (
          <span className="flex items-center gap-2"><StatusBadge status={order.status} /><span className="text-xs text-mute">{dateTime(order.createdAt)}</span></span>
        )}
      </div>
    </Link>
  );
}

/** Orders as one sheet with hairlines between them (the phone list). */
export function OrderList({ orders }: { orders: Order[] }) {
  return <div className="divide-y overflow-hidden rounded-2xl border bg-white">{orders.map(o => <OrderCard key={o.id} order={o} flat />)}</div>;
}
