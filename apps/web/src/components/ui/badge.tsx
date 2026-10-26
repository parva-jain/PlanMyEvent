import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * DESIGN.md "Chips": status chips are a tint background with darker text and a small dot.
 * Event tones use the event tint with a darkened (light) or lightened (dark) accent as text,
 * for AA contrast. They are only for event chips, never for actions.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-small whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-fg-secondary [--dot:var(--fg-muted)]',
        success: 'bg-success-tint text-success-text [--dot:var(--success)]',
        warning: 'bg-warning-tint text-warning-text [--dot:var(--warning)]',
        danger: 'bg-danger-tint text-danger-text [--dot:var(--danger)]',
        info: 'bg-info-tint text-info-text [--dot:var(--info)]',
        accent: 'bg-accent-tint text-accent-text [--dot:var(--accent)]',
        wedding: 'bg-event-wedding-tint text-event-wedding-text [--dot:var(--event-wedding)]',
        conference:
          'bg-event-conference-tint text-event-conference-text [--dot:var(--event-conference)]',
        fair: 'bg-event-fair-tint text-event-fair-text [--dot:var(--event-fair)]',
        celebration:
          'bg-event-celebration-tint text-event-celebration-text [--dot:var(--event-celebration)]',
        custom: 'bg-event-custom-tint text-event-custom-text [--dot:var(--event-custom)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Leading status dot (DESIGN.md status chips). */
  dot?: boolean;
}

function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-(--dot)" />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
