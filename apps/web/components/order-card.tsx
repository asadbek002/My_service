import Link from 'next/link';
import { dateTime, daysSince, deviceName, fullName, money } from '../lib/format';
import { paidOf, type Order } from '../lib/queries';
import { cn } from '../lib/utils';
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
  return (
    <Link href={`/orders/${order.id}`} className={cn('block bg-white px-4 py-3.5 transition-colors active:bg-paper', flat ? 'hover:bg-[#F3F7F6]' : 'rounded-xl border hover:border-ink/30')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{deviceName(order.device)}</p>
          <p className="truncate text-[13px] text-mute">{fullName(order.customer)} · <span className="num font-mono text-xs">{order.number}</span></p>
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
