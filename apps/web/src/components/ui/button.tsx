import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { DelayedSpinner } from './delayed-spinner';

/** DESIGN.md "Buttons": 48 px on phone, 40 px on desktop; radius 12; icons 20 px. */
const buttonVariants = cva(
  [
    'pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-label whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,transform] duration-(--dur-fast) ease-(--ease-out)',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-5',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border border-border bg-surface text-fg hover:bg-surface-muted',
        ghost: 'text-primary-text hover:bg-primary-tint',
        destructive: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        default: 'h-12 px-5 lg:h-10 lg:px-4',
        sm: 'h-10 px-4 text-small lg:h-9 lg:px-3',
        icon: 'size-12 lg:size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a link) with button styles. */
  asChild?: boolean;
  /** Leading icon; replaced by a spinner while loading. */
  icon?: ReactNode;
  /** Shows a spinner in place of the icon after 300 ms and blocks clicks. */
  loading?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  loading = false,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button data-slot="button" aria-busy={loading || undefined} className={classes} {...props}>
      {loading ? <DelayedSpinner fallback={icon} /> : icon}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
