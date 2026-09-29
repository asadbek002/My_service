import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[color,background-color,border-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-ink text-white hover:bg-ink-soft active:bg-black',
        /** The one main action of a screen (Yangi qabul, Qabul qilish, To'lov). Ink on orange. */
        brand: 'bg-brand text-ink hover:bg-brand-strong active:bg-brand-strong',
        secondary: 'border border-line bg-white text-ink hover:border-ink/40 active:bg-paper',
        outline: 'border border-line bg-white text-ink hover:border-ink/40 active:bg-paper',
        ghost: 'text-ink hover:bg-black/[0.04] active:bg-black/[0.07]',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700',
        link: 'text-ink underline underline-offset-4',
      },
      size: {
        default: 'h-11 px-4 sm:h-10',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-12 px-6 text-base rounded-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';
export { Button, buttonVariants };
