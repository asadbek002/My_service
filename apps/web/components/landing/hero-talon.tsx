'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Ruler, type RulerKind } from '../ui/ruler';
import { StatusBadge } from '../ui/status-badge';
import { cn } from '../../lib/utils';

// One repair, told in three beats: taken in, on the bench, ready — and the customer hears about it.
const BEATS: { status: string; kind: RulerKind; days: number; note: string }[] = [
  { status: 'RECEIVED', kind: 'qabul', days: 1, note: 'Qabul qilindi, chek berildi' },
  { status: 'IN_REPAIR', kind: 'tamir', days: 2, note: 'Ustada: ekran almashtirilmoqda' },
  { status: 'READY', kind: 'tayyor', days: 3, note: 'Tayyor — mijozga xabar ketdi' },
];

/**
 * The home page's thesis: the paper repair ticket, alive. It walks through the statuses with the
 * day ruler filling, and at "Tayyor" the customer's Telegram message slides in. Still for reduced motion.
 */
export function HeroTalon() {
  const [beat, setBeat] = useState(2);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setBeat(0);
    const t = setInterval(() => setBeat(b => (b + 1) % BEATS.length), 2600);
    return () => clearInterval(t);
  }, []);
  const b = BEATS[beat]!;
  const ready = b.status === 'READY';

  return (
    <div className="relative mx-auto w-full max-w-[22rem]" aria-hidden="true">
      <article className="talon rotate-[-1.5deg] text-ink [&_.talon-cut]:before:border-transparent [&_.talon-cut]:before:bg-mat [&_.talon-cut]:after:border-transparent [&_.talon-cut]:after:bg-mat shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span key={b.status} className="inline-block animate-stamp"><StatusBadge status={b.status} className="-rotate-2" /></span>
            <span className="font-mono text-[11px] text-mute">MS-261107-014</span>
          </div>
          <p className="mt-4 text-[1.6rem] font-bold leading-none tracking-tight">Samsung A52</p>
          <p className="mt-1.5 text-[13px] text-mute">Ekran singan · Alisher, +998 90 *** 45 67</p>
          <div className="mt-5 rounded-lg bg-paper p-3">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="text-mute">ustaxonada</span>
              <b className="num font-mono font-semibold">{b.days} kun</b>
            </div>
            <Ruler days={b.days} kind={b.kind} large className="mt-2" />
          </div>
          <p className="mt-3 min-h-[1.25rem] text-[13px] font-medium">{b.note}</p>
        </div>
        <div className="talon-cut" />
        <div className="flex items-baseline justify-between p-5 pt-4">
          <span className="text-sm font-semibold">Jami</span>
          <span className="num font-mono text-xl font-semibold">450 000 so&apos;m</span>
        </div>
      </article>

      <div className={cn(
        'absolute -bottom-16 -right-2 w-[15.5rem] rounded-2xl rounded-br-md bg-white p-3 text-[13px] leading-snug text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] transition-all duration-500 sm:-right-10',
        ready ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
      )}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#229ED9]"><Send className="h-3 w-3" /> Mobile Fix · Telegram</p>
        <p className="mt-1">✅ <b>Samsung A52</b> tayyor. Olib ketishingiz mumkin. To&apos;lov: 450 000 so&apos;m.</p>
      </div>
    </div>
  );
}
