import * as React from 'react';
import { Label } from './label';
import { cn } from '../../lib/utils';
interface FormFieldProps {
  label: string;
  error?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}
export function FormField({ label, error, required, description, children, className }: FormFieldProps) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label>{label}{required && <span className="text-red-500 ml-1">*</span>}</Label>
      {children}
      {description && !error && <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
