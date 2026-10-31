'use client';

import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';

import { distance, duration } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { useShouldReduceMotion } from './motion-provider';

/**
 * A stepper's number (MOTION.md 6.8 and 6.15): going up, the old number leaves upward and
 * the new one comes in from below, `fast`; going down, the other way. The wrapper is the
 * live region, so screen readers hear each new value once. Reduced motion: a crossfade.
 */
export function RollingNumber({
  value,
  className,
  testId,
}: {
  value: number;
  className?: string;
  testId?: string;
}) {
  const reduced = useShouldReduceMotion();
  // Which way it rolls, kept from the last change (React's "adjust state while rendering").
  const [last, setLast] = useState({ value, direction: 1 });
  if (last.value !== value) setLast({ value, direction: value > last.value ? 1 : -1 });
  const direction = value === last.value ? last.direction : value > last.value ? 1 : -1;
  const offset = reduced ? 0 : distance.rise;
  return (
    <span
      aria-live="polite"
      data-testid={testId}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden tabular-nums',
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <m.span
          key={value}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ y: dir * offset, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (dir: number) => ({ y: -dir * offset, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: duration.fast }}
        >
          {value}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
