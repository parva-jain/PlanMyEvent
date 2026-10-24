'use client';

import { m, useInView } from 'motion/react';
import { useRef, useState } from 'react';

import { duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

interface ProgressFillProps {
  /** 0 to 100. */
  value: number;
  /** Accessible name, e.g. "Tasks done". */
  label: string;
  variant?: 'bar' | 'ring';
  /** Ring diameter in px. */
  size?: number;
  className?: string;
}

const RING_STROKE = 6;

/**
 * Bar or ring that fills from 0 to `value` when it comes into view, then follows changes
 * (MOTION.md section 4: 600 ms `out`; turns green with a 150 ms colour fade at 100%).
 * Only transform (bar) and pathLength (ring) animate. Reduced motion shows the final value
 * at once; this is explicit because MotionConfig only skips transform animations, not pathLength.
 */
export function ProgressFill({
  value,
  label,
  variant = 'bar',
  size = 48,
  className,
}: ProgressFillProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [settledAt, setSettledAt] = useState<number | null>(null);
  const complete = clamped === 100 && settledAt === 100;
  const target = inView ? clamped / 100 : 0;
  const reduced = useShouldReduceMotion();
  const transition = reduced ? { duration: 0 } : { duration: duration.deliberate, ease: ease.out };
  const colour = complete ? 'var(--success)' : 'var(--accent)';
  const colourFade =
    'background-color var(--dur-fast) var(--ease-out), stroke var(--dur-fast) var(--ease-out)';

  const a11y = {
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(clamped),
  } as const;

  if (variant === 'ring') {
    const radius = (size - RING_STROKE) / 2;
    return (
      <div ref={ref} {...a11y} className={className} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth={RING_STROKE}
          />
          <m.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            style={{ stroke: colour, transition: colourFade }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: target }}
            transition={transition}
            onAnimationComplete={() => setSettledAt(clamped)}
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      {...a11y}
      className={`h-2 overflow-hidden rounded-full bg-surface-muted ${className ?? ''}`}
    >
      <m.div
        className="h-full origin-left rounded-full"
        style={{ background: colour, transition: colourFade }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: target }}
        transition={transition}
        onAnimationComplete={() => setSettledAt(clamped)}
      />
    </div>
  );
}
