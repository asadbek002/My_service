import * as React from 'react';
import { Label } from './label';
import { cn } from './utils';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
}

export function FormField({
  label,
  error,
  required,
  description,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn('grid gap-1.5', className)} {...props}>
      {label && (
        <div className="flex items-center justify-between">
          <Label className={cn(error && 'text-red-500')}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </Label>
        </div>
      )}
      {children}
      {description && !error && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      )}
      {error && (
        <p className="text-xs font-medium text-red-500 animate-in fade-in-50 duration-150">
          {error}
        </p>
      )}
    </div>
  );
}
