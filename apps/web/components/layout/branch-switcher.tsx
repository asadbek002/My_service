'use client';

import { MapPin } from 'lucide-react';
import { useCurrentBranch } from '../../lib/branches';
import { useMe } from '../../lib/queries';
import { cn } from '../../lib/utils';

/**
 * Which branch the screens show and new work goes to. Only when there is a choice: two or more open
 * branches the user works in. "Barcha filiallar" shows everything the user may see.
 */
export function BranchSwitcher({ dark, className }: { dark?: boolean; className?: string }) {
  const { data: me } = useMe();
  const { branch, open, multi, set } = useCurrentBranch();
  if (!multi || me?.support) return null;
  return (
    <label className={cn('relative flex min-w-0 items-center gap-1.5 rounded-full border text-sm font-medium', dark ? 'border-white/15 bg-white/[0.06] text-white' : 'border-line bg-white text-ink', className)}>
      <MapPin className={cn('pointer-events-none absolute left-2.5 h-4 w-4 shrink-0', dark ? 'text-brand-light' : 'text-mute')} aria-hidden="true" />
      <select value={branch} onChange={e => set(e.target.value)} aria-label="Filial"
        className={cn('h-9 w-full min-w-0 cursor-pointer appearance-none truncate rounded-full bg-transparent pl-8 pr-7 focus:outline-none', dark && '[&>option]:text-ink')}>
        <option value="">Barcha filiallar</option>
        {open.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <span className={cn('pointer-events-none absolute right-3 text-[10px]', dark ? 'text-white/60' : 'text-mute')} aria-hidden="true">▼</span>
    </label>
  );
}
