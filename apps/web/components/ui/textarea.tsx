import * as React from 'react';
import { cn } from '../../lib/utils';
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea className={cn('flex min-h-[90px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 resize-y', className)} ref={ref} {...props} />
));
Textarea.displayName = 'Textarea';
export { Textarea };
