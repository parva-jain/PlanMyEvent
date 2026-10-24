'use client';

import { m } from 'motion/react';

import { duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

interface CheckDrawProps {
  checked: boolean;
  /** Box size in px (DESIGN.md: 20). */
  size?: number;
  className?: string;
}

/**
 * Checkbox visual: the box fills (`instant`), then the tick draws (pathLength 0 → 1,
 * 250 ms `out`). Reduced motion: the tick fades in instead of drawing. A box that is
 * already checked on first render shows without animating. Decorative: pair it with a
 * real input or aria state on the parent.
 */
export function CheckDraw({ checked, size = 20, className }: CheckDrawProps) {
  const reduced = useShouldReduceMotion();

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[6px] border ${
        checked ? 'border-primary bg-primary' : 'border-border-strong bg-surface'
      } ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        transition:
          'background-color var(--dur-instant) var(--ease-out), border-color var(--dur-instant) var(--ease-out)',
      }}
    >
      <svg viewBox="0 0 20 20" width={size * 0.7} height={size * 0.7} fill="none">
        <m.path
          d="M4.5 10.5l3.5 3.5 7.5-8"
          stroke="var(--on-primary)"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={
            reduced
              ? { pathLength: { duration: 0 }, opacity: { duration: duration.fast } }
              : {
                  pathLength: {
                    duration: duration.moderate,
                    ease: ease.out,
                    delay: checked ? duration.instant : 0,
                  },
                  opacity: { duration: duration.instant },
                }
          }
        />
      </svg>
    </span>
  );
}
