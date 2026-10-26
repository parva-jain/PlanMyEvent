'use client';

import { m } from 'motion/react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { duration, ease } from '@/lib/motion';

/**
 * Desktop connector between the three step markers (MOTION.md 6.2): draws left to right
 * once in view (`pathLength`, 600 ms). Reduced motion: drawn at once (pathLength isn't
 * covered by MotionConfig, so it's handled here).
 */
export function StepConnector() {
  const reduced = useShouldReduceMotion();
  return (
    // The wrapper spans first to last marker; an <svg> alone wouldn't stretch with left/right.
    <div
      aria-hidden
      className="absolute top-1/2 h-0.5 -translate-y-1/2 [left:calc((100%_-_3rem)/6)] [right:calc((100%_-_3rem)/6)]"
    >
      <svg
        viewBox="0 0 100 2"
        preserveAspectRatio="none"
        className="block size-full overflow-visible"
      >
        <line
          x1="0"
          y1="1"
          x2="100"
          y2="1"
          stroke="var(--border-strong)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <m.line
          x1="0"
          y1="1"
          x2="100"
          y2="1"
          stroke="var(--primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={reduced ? { duration: 0 } : { duration: duration.deliberate, ease: ease.out }}
        />
      </svg>
    </div>
  );
}
