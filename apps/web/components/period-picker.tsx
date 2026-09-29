'use client';

import { Input } from './ui/input';
import { PERIODS, preset, type Period, type PeriodKey } from '../lib/period';
import { today } from '../lib/format';

/** Period chips (all, today, this month, last month, custom dates) with date inputs for "custom". */
export function PeriodPicker({ mode, value, onChange, allowAll = true }: { mode: PeriodKey; value: Period; onChange: (mode: PeriodKey, value: Period) => void; allowAll?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {PERIODS.filter(([k]) => allowAll || k !== 'all').map(([key, text]) => (
          <button key={key} type="button" className="chip" aria-pressed={mode === key} onClick={() => onChange(key, key === 'custom' ? value[0] ? value : preset('custom') : preset(key))}>{text}</button>
        ))}
      </div>
      {mode === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={value[0]} max={value[1] || today()} onChange={e => e.target.value && onChange('custom', [e.target.value, value[1]])} aria-label="Boshlanish sanasi" />
          <Input type="date" value={value[1]} min={value[0]} max={today()} onChange={e => e.target.value && onChange('custom', [value[0], e.target.value])} aria-label="Tugash sanasi" />
        </div>
      )}
    </div>
  );
}
