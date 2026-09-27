'use client';
import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldClass } from './input';

/** Whole-sum input: shows "1 500 000", reports plain digits ("1500000"). Numeric keypad on phones. */
export function MoneyInput({ value, onChange, className, id, placeholder = '0', autoFocus, ...rest }: {
  value: string; onChange: (digits: string) => void; className?: string; id?: string; placeholder?: string; autoFocus?: boolean;
  'aria-label'?: string; name?: string;
}) {
  const shown = value ? Number(value).toLocaleString('ru-RU').replace(/ /g, ' ') : '';
  return (
    <div className="relative">
      <input
        {...rest}
        id={id}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="next"
        placeholder={placeholder}
        value={shown}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12))}
        className={cn(fieldClass, 'num h-11 pr-14 text-right font-mono sm:h-10', className)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-mute">so'm</span>
    </div>
  );
}
