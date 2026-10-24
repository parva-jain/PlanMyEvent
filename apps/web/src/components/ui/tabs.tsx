'use client';

import { animate, m, useMotionTemplate, useMotionValue } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { duration, ease, spring } from '@/lib/motion';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  );
}

/**
 * Segmented control with a sliding active pill (MOTION.md 6.2: indicator slides with the
 * `snappy` spring). The pill is one layer revealed with an animated clip-path, so it needs
 * no layout animations (and no extra Motion bundle) and keeps its rounded ends.
 * Before hydration the active tab paints its own background, so it never looks blank.
 * Reduced motion: the pill jumps.
 */
function TabsList({ className, children, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLSpanElement>(null);
  const left = useMotionValue(0);
  const right = useMotionValue(10_000); // fully clipped until measured
  const clipPath = useMotionTemplate`inset(0 ${right}px 0 ${left}px round 9999px)`;
  const reduced = useShouldReduceMotion();
  const hydrated = useHydrated();
  const placed = useRef(false);

  const place = useCallback(
    (animated: boolean) => {
      const list = listRef.current;
      const layer = layerRef.current;
      const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!list || !layer || !active) return;
      const nextLeft = active.offsetLeft - layer.offsetLeft;
      const nextRight = layer.offsetWidth - (nextLeft + active.offsetWidth);
      if (!animated || !placed.current || reduced) {
        left.jump(nextLeft);
        right.jump(nextRight);
      } else {
        animate(left, nextLeft, spring.snappy);
        animate(right, nextRight, spring.snappy);
      }
      placed.current = true;
    },
    [left, right, reduced],
  );

  // First placement before paint.
  useLayoutEffect(() => place(false), [place]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // The active tab changes via Radix's data-state, without re-rendering the list.
    const stateObserver = new MutationObserver(() => place(true));
    stateObserver.observe(list, { subtree: true, attributeFilter: ['data-state'] });
    // Font loading and viewport changes move tabs: follow without animating.
    const sizeObserver = new ResizeObserver(() => place(false));
    sizeObserver.observe(list);
    return () => {
      stateObserver.disconnect();
      sizeObserver.disconnect();
    };
  }, [place]);

  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
      <TabsPrimitive.List
        ref={listRef}
        data-slot="tabs-list"
        data-indicator={hydrated ? 'ready' : 'pending'}
        className={cn(
          'group/tabs relative inline-flex items-center rounded-full bg-surface-muted p-1',
          className,
        )}
        {...props}
      >
        <m.span
          ref={layerRef}
          aria-hidden
          className="absolute inset-1 rounded-full bg-primary"
          style={{ clipPath, WebkitClipPath: clipPath }}
        />
        {children}
      </TabsPrimitive.List>
    </div>
  );
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'relative z-10 inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-label whitespace-nowrap text-fg-secondary lg:h-10',
        'transition-colors duration-(--dur-fast) ease-(--ease-out) hover:text-fg',
        'data-[state=active]:text-on-primary group-data-[indicator=pending]/tabs:data-[state=active]:bg-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** Content fades in on tab change (`base`); `fast` with reduced motion (opacity only). */
function TabsContent({
  className,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  const reduced = useShouldReduceMotion();
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    >
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? duration.fast : duration.base, ease: ease.inOut }}
      >
        {children}
      </m.div>
    </TabsPrimitive.Content>
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
