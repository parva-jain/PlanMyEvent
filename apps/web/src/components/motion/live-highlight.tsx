'use client';

import { m } from 'motion/react';
import type { ReactNode } from 'react';

interface LiveHighlightProps {
  children: ReactNode;
  /** Change this (e.g. to the new version) to play the glow; null for none. */
  highlightKey: string | number | null;
  /** `others`: 1.5 s for someone else's change; `own`: 800 ms for your own. */
  source?: 'others' | 'own';
  /** Optional caption shown with the glow, e.g. "Rahul just updated this". */
  label?: ReactNode;
  className?: string;
}

const TIMING: Record<'others' | 'own', { duration: number; times: number[] }> = {
  // 200 ms in, hold, 600 ms out (MOTION.md section 4).
  others: { duration: 1.5, times: [0, 0.2 / 1.5, 0.9 / 1.5, 1] },
  own: { duration: 0.8, times: [0, 0.2 / 0.8, 0.4 / 0.8, 1] },
};

/**
 * Indigo-tint glow behind a row or card changed live, then fades out. Opacity only, so it
 * stays under reduced motion: it tells the user something changed.
 */
export function LiveHighlight({
  children,
  highlightKey,
  source = 'others',
  label,
  className,
}: LiveHighlightProps) {
  const timing = TIMING[source];
  const keyframes = { opacity: [0, 1, 1, 0] };

  return (
    <div className={`relative isolate rounded-[inherit] ${className ?? ''}`}>
      {highlightKey !== null && (
        <m.span
          key={`glow-${highlightKey}`}
          aria-hidden
          className="pointer-events-none absolute -inset-1 -z-10 rounded-[inherit] bg-primary-tint"
          initial={{ opacity: 0 }}
          animate={keyframes}
          transition={{ ...timing, ease: 'linear' }}
        />
      )}
      {children}
      {highlightKey !== null && label && (
        <m.span
          key={`label-${highlightKey}`}
          role="status"
          className="pointer-events-none absolute -top-3 right-2 rounded-full bg-primary px-2 py-0.5 text-caption text-on-primary shadow-card"
          initial={{ opacity: 0 }}
          animate={keyframes}
          transition={{ ...timing, ease: 'linear' }}
        >
          {label}
        </m.span>
      )}
    </div>
  );
}
