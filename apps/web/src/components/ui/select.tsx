import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Native select with the input look (DESIGN.md "Inputs"): the phone's own picker, and
 * keyboard and screen-reader support for free. `size="sm"` for filter rows.
 */
function Select({
  className,
  size = 'default',
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & { size?: 'default' | 'sm' }) {
  return (
    <select
      data-slot="select"
      className={cn(
        'w-full rounded-control border border-border-strong bg-surface-muted text-fg',
        'transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out)',
        'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none',
        'disabled:opacity-60',
        size === 'sm' ? 'h-10 px-3 text-small' : 'h-12 px-4 text-body',
        className,
      )}
      {...props}
    />
  );
}

/** Multi-line input with the input look. */
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-control border border-border-strong bg-surface-muted px-4 py-3 text-body text-fg placeholder:text-fg-muted',
        'transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-out)',
        'focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary-tint focus-visible:outline-none',
        'disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export { Select, Textarea };
