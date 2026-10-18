import * as React from 'react';
import { Badge, type BadgeProps } from './badge';
import { cn } from '../../lib/utils';

type Variant = NonNullable<BadgeProps['variant']>;
export const STATUS: Record<string, { label: string; variant: Variant; dot: string }> = {
  RECEIVED: { label: 'Qabul qilindi', variant: 'default', dot: 'bg-ink' },
  IN_REPAIR: { label: "Ta'mirda", variant: 'info', dot: 'bg-blue-600' },
  READY: { label: 'Tayyor', variant: 'success', dot: 'bg-emerald-600' },
  DELIVERED: { label: 'Berildi', variant: 'outline', dot: 'bg-mute' },
  CANCELLED: { label: 'Bekor qilindi', variant: 'destructive', dot: 'bg-red-600' },
  ACTIVE: { label: 'Faol', variant: 'success', dot: 'bg-emerald-600' },
  SUSPENDED: { label: "To'xtatilgan", variant: 'destructive', dot: 'bg-red-600' },
  INVITED: { label: 'Taklif qilingan', variant: 'warning', dot: 'bg-amber-500' },
  ARCHIVED: { label: 'Arxivda', variant: 'outline', dot: 'bg-mute' },
};
export const statusLabel = (status: string) => STATUS[status]?.label ?? status;

/** Order statuses read as a stamp on the ticket; other statuses (staff, plans) stay plain badges. */
const STAMP: Record<string, [string, string]> = {
  RECEIVED: ['Qabulda', 'text-st-qabul-ink'],
  IN_REPAIR: ["Ta'mirda", 'text-st-tamir-ink'],
  READY: ['Tayyor', 'text-st-tayyor-ink'],
  DELIVERED: ['Berildi', 'text-mute'],
  CANCELLED: ['Bekor', 'text-red-700'],
};

export function StatusBadge({ status, late, className, ...props }: { status: string; late?: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  const stamp = STAMP[status];
  if (stamp) {
    const [label, color] = late ? ['Kutmoqda', 'text-st-kutish-ink'] : stamp;
    return (
      <span className={cn('inline-flex shrink-0 items-center rounded-[6px] border-[1.5px] border-current px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]', color, className)} {...props}>
        {label}
      </span>
    );
  }
  const s = STATUS[status] ?? { label: status, variant: 'default' as const, dot: 'bg-mute' };
  return (
    <Badge variant={s.variant} className={className} {...props}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  );
}
