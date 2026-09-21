import * as React from 'react';
import { Label } from './label';
import { cn } from '../../lib/utils';
interface FormFieldProps { label: string; error?: string; required?: boolean; children: React.ReactNode; className?: string; }
export function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
