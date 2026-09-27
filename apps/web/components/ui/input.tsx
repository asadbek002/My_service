import * as React from 'react';
import { cn } from '../../lib/utils';
// 16px text on phones: smaller text makes iOS Safari zoom into the field.
export const fieldClass = 'w-full rounded-md border border-line bg-white px-3 text-base text-ink placeholder:text-mute/70 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:bg-paper disabled:opacity-60 sm:text-sm';
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn(fieldClass, 'h-11 sm:h-10', className)} ref={ref} {...props} />
));
Input.displayName = 'Input';
export { Input };
