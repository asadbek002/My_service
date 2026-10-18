import { cn } from '../../lib/utils';

export type RulerKind = 'qabul' | 'tamir' | 'tayyor';
const FILL: Record<RulerKind, string> = { qabul: 'bg-st-qabul', tamir: 'bg-st-tamir', tayyor: 'bg-st-tayyor' };
/** A ready device waiting longer than this many days turns amber. */
export const LATE_AFTER = 5;

/** Status of an order as a ruler colour; null when the device is no longer in the shop. */
export function rulerKind(status: string): RulerKind | null {
  return status === 'RECEIVED' ? 'qabul' : status === 'IN_REPAIR' ? 'tamir' : status === 'READY' ? 'tayyor' : null;
}

/**
 * Lineyka: one tick = one day the device has been in the workshop (14 ticks, a taller one each week).
 * Ready devices left past LATE_AFTER days show the overdue ticks amber.
 */
export function Ruler({ days, kind, large, className }: { days: number; kind: RulerKind; large?: boolean; className?: string }) {
  return (
    <span role="img" aria-label={`Ustaxonada ${days} kun`} className={cn('flex items-end', large ? 'h-[30px] justify-between' : 'h-4 gap-[3px]', className)}>
      {Array.from({ length: 14 }, (_, i) => {
        const on = i < days;
        const late = on && kind === 'tayyor' && i >= LATE_AFTER;
        const major = i % 7 === 6;
        return (
          <span key={i} className={cn('block rounded-full', large ? 'w-[5px]' : 'w-[3px]', large ? (major ? 'h-[30px]' : 'h-5') : (major ? 'h-4' : 'h-2.5'),
            !on ? 'bg-tick' : late ? 'bg-st-kutish' : FILL[kind])} />
        );
      })}
    </span>
  );
}
