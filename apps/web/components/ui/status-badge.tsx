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

export function StatusBadge({ status, className, ...props }: { status: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const s = STATUS[status] ?? { label: status, variant: 'default' as const, dot: 'bg-mute' };
  return (
    <Badge variant={s.variant} className={className} {...props}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </Badge>
  );
}
