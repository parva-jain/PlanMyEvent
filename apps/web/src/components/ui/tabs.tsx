'use client';

import { animate, frame, m, useMotionTemplate, useMotionValue } from 'motion/react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { duration, ease, spring } from '@/lib/motion';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

/** The list's inner padding (p-1): the widest the sliding layer gets. */
const PAD = 4;

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
 * no layout animations (and no extra Motion bundle) and keeps its rounded ends. At rest the
 * layer's box matches the active tab exactly; it widens to the whole list only while sliding,
 * so nothing sits under inactive tabs (contrast checkers ignore clip-path).
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
  // Bumped on every placement, so a finished slide only collapses the layer if it's still current.
  const generation = useRef(0);

  const place = useCallback(
    (animated: boolean) => {
      const list = listRef.current;
      const layer = layerRef.current;
      const active = list?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!list || !layer || !active) return;
      const run = ++generation.current;
      const setBox = (boxLeft: number, boxWidth: number) => {
        layer.style.left = `${boxLeft}px`;
        layer.style.width = `${boxWidth}px`;
      };
      const target = { left: active.offsetLeft, right: active.offsetLeft + active.offsetWidth };

      if (!animated || !placed.current || reduced) {
        setBox(target.left, target.right - target.left);
        left.jump(0);
        right.jump(0);
      } else {
        // Where the pill is drawn now (it may be mid-slide), in list coordinates.
        const from = {
          left: layer.offsetLeft + left.get(),
          right: layer.offsetLeft + layer.offsetWidth - right.get(),
        };
        const full = { left: list.clientLeft + PAD, right: list.clientWidth - PAD };
        setBox(full.left, full.right - full.left);
        left.jump(from.left - full.left);
        right.jump(full.right - from.right);
        void Promise.all([
          animate(left, target.left - full.left, spring.snappy),
          animate(right, full.right - target.right, spring.snappy),
        ]).then(() => {
          if (run !== generation.current) return;
          left.jump(0);
          right.jump(0);
          // Motion applies the clip reset in its render step; resize the box in that same frame.
          frame.render(() => {
            if (run === generation.current) setBox(target.left, target.right - target.left);
          });
        });
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
          className="absolute inset-y-1 rounded-full bg-primary"
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
