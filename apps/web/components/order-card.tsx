import Link from 'next/link';
import { dateTime, deviceName, fullName, money } from '../lib/format';
import { paidOf, type Order } from '../lib/queries';
import { StatusBadge } from './ui/status-badge';

/** One order as a stub of its talon: number and status on top, money below the tear line. */
export function OrderCard({ order }: { order: Order }) {
  const paid = paidOf(order.payments);
  const balance = Number(order.total) - paid;
  // Owed money becomes a debt once the device has left the shop.
  const debt = balance > 0 && order.status === 'DELIVERED';
  const partial = !debt && balance > 0 && paid > 0 && order.status !== 'CANCELLED';
  return (
    <Link href={`/orders/${order.id}`} className="talon block transition-colors hover:border-ink/40">
      <div className="px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="num truncate font-mono text-sm font-semibold">{order.number}</span>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-2 truncate font-medium">{deviceName(order.device)}</p>
        <p className="truncate text-sm text-mute">{fullName(order.customer)} · {order.complaint}</p>
      </div>
      <div className="talon-cut" />
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
        <span className="text-xs text-mute">{dateTime(order.createdAt)}</span>
        <span className="num font-mono">
          {debt ? <span className="font-semibold text-amber-700">qarz {money(balance)}</span>
            : partial ? <><span className="text-mute">{money(order.total)} · </span><span className="font-semibold text-amber-700">qoldiq {money(balance)}</span></>
            : <span className="font-semibold">{money(order.total)}</span>}
        </span>
      </div>
    </Link>
  );
}
