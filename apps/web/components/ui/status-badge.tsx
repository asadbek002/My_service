import * as React from 'react';
import { Badge } from './badge';
import { cn } from '../../lib/utils';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'purple'; dotColor: string }> = {
  RECEIVED:                   { label: 'Qabul qilindi',    variant: 'secondary',   dotColor: 'bg-zinc-400' },
  DIAGNOSING:                 { label: 'Diagnostikada',    variant: 'info',        dotColor: 'bg-sky-500' },
  WAITING_CUSTOMER_APPROVAL:  { label: 'Mijoz tasdig\'i',   variant: 'warning',     dotColor: 'bg-amber-500' },
  WAITING_PART:               { label: 'Detal kutilmoqda',  variant: 'purple',      dotColor: 'bg-purple-500' },
  IN_REPAIR:                  { label: 'Ta\'mirda',          variant: 'info',        dotColor: 'bg-blue-600 animate-pulse' },
  READY:                      { label: 'Tayyor',            variant: 'success',     dotColor: 'bg-emerald-500' },
  DELIVERED:                  { label: 'Berildi',           variant: 'default',     dotColor: 'bg-zinc-300' },
  CANCELLED:                  { label: 'Bekor qilindi',     variant: 'destructive', dotColor: 'bg-red-500' },
  UNREPAIRABLE:               { label: 'Tuzatib bo\'lmadi',  variant: 'destructive', dotColor: 'bg-red-700' },
  ACTIVE:                     { label: 'Faol',              variant: 'success',     dotColor: 'bg-emerald-500' },
  SUSPENDED:                  { label: 'To\'xtatilgan',     variant: 'destructive', dotColor: 'bg-red-500' },
  INVITED:                    { label: 'Taklif yuborildi',  variant: 'warning',     dotColor: 'bg-amber-500' },
  ARCHIVED:                   { label: 'Arxivlangan',       variant: 'default',     dotColor: 'bg-zinc-400' },
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const s = STATUS_MAP[status] ?? { label: status, variant: 'secondary' as const, dotColor: 'bg-zinc-400' };
  return (
    <Badge variant={s.variant} className={cn('gap-1.5 font-medium px-2.5 py-1', className)} {...props}>
      <span className={cn('h-1.5 w-1.5 rounded-full inline-block', s.dotColor)} />
      {s.label}
    </Badge>
  );
}
