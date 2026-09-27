import * as React from 'react';
import { cn } from '../../lib/utils';
interface FormFieldProps {
  label: string;
  error?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}
/** A label wrapping its control, so tapping the label focuses the field. */
export function FormField({ label, error, required, description, children, className }: FormFieldProps) {
  return (
    <label className={cn('grid gap-1.5', className)}>
      <span className="text-sm font-medium text-ink">{label}{required && <span className="ml-0.5 text-red-600">*</span>}</span>
      {children}
      {description && !error && <span className="text-xs text-mute">{description}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
