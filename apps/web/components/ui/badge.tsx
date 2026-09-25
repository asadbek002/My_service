import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', {
  variants: {
    variant: {
      default: 'bg-gray-100 text-gray-800',
      secondary: 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50',
      destructive: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
      outline: 'border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300',
      success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400',
      warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400',
      danger: 'bg-red-100 text-red-800',
      info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400',
      purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400',
    },
  },
  defaultVariants: { variant: 'default' },
});
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}
// A span, so badges can sit inside text (a <div> inside <p> breaks hydration).
function Badge({ className, variant, ...props }: BadgeProps) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
export { Badge, badgeVariants };
