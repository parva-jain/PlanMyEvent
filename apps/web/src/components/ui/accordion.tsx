'use client';

import { ChevronDown } from 'lucide-react';
import { Accordion as AccordionPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Accordion({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

/** Each item is its own card, as in the Stitch FAQ. */
function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface shadow-card',
        className,
      )}
      {...props}
    />
  );
}

/** Chevron rotates 180° (`moderate`, `out`); instant with reduced motion. */
function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex min-h-12 flex-1 items-center justify-between gap-4 px-4 py-3 text-left text-label transition-colors duration-(--dur-fast) hover:bg-surface-muted sm:px-5',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className="size-5 shrink-0 text-primary-text transition-transform duration-(--dur-moderate) ease-(--ease-out) group-data-[state=open]:rotate-180 reduce-motion:transition-none!"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/** Height animates open and closed (MOTION.md 6.2 FAQ); instant with reduced motion. */
function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-[accordion-up_var(--dur-moderate)_var(--ease-out)] data-[state=open]:animate-[accordion-down_var(--dur-moderate)_var(--ease-out)] reduce-motion:animate-none!"
      {...props}
    >
      <div className={cn('px-4 pb-4 text-fg-secondary sm:px-5', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
