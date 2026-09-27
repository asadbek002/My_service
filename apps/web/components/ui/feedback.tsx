import * as React from 'react';
import { cn } from '../../lib/utils';

export function ErrorBox({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p role="alert" className={cn('rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700', className)}>{children}</p>;
}
export function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p role="status" className={cn('rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800', className)}>{children}</p>;
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-mute">{children}</div>}
    </div>
  );
}
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-black/[0.04]" />)}
    </div>
  );
}
/** Label/value row used on tickets and summaries. */
export function Row({ label, children, strong, className }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1', className)}>
      <span className={cn('text-sm', strong ? 'font-semibold' : 'text-mute')}>{label}</span>
      <span className={cn('num text-right font-mono', strong ? 'text-base font-semibold' : 'text-sm')}>{children}</span>
    </div>
  );
}
