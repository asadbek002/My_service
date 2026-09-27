import * as React from 'react';
import { cn } from '../../lib/utils';
import { fieldClass } from './input';
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, ...props }, ref) => (
  <select className={cn(fieldClass, 'h-11 sm:h-10', className)} ref={ref} {...props}>{children}</select>
));
Select.displayName = 'Select';
export { Select };
