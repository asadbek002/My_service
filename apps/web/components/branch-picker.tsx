'use client';

import { MapPin } from 'lucide-react';
import { useCurrentBranch } from '../lib/branches';

/** Where this piece of work belongs, as chips; shown only when there are several open branches. */
export function BranchPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { open, multi } = useCurrentBranch();
  if (!multi) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Filial">
      <MapPin className="h-4 w-4 text-mute" aria-hidden="true" />
      {open.map(b => <button key={b.id} type="button" role="radio" aria-checked={value === b.id} onClick={() => onChange(b.id)} className="chip">{b.name}</button>)}
    </div>
  );
}
