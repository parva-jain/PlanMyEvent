'use client';

import { animate, useInView } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

/** First reveal counts for 800 ms; later updates for `slow` (MOTION.md section 4). */
const FIRST_DURATION = duration.slow * 2;

interface CountUpProps {
  value: number;
  /** Where the first count starts. */
  from?: number;
  /** Intl options, e.g. `{ style: 'currency', currency: 'INR', maximumFractionDigits: 0 }`. */
  format?: Intl.NumberFormatOptions;
  className?: string;
}

/**
 * Counts up to `value` (MOTION.md section 4).
 * - The server renders the final number: correct for SEO, no-JS and reduced motion.
 * - If it starts off-screen, it resets to `from` after hydration and counts when 20% visible.
 *   If it's already on screen at load, it stays put (no final → 0 → final flash).
 * - Later value changes count from the old value over 400 ms.
 * - An invisible copy of the final value reserves the width, so digits never shift layout.
 */
export function CountUp({ value, from = 0, format, className }: CountUpProps) {
  const formatter = useMemo(() => new Intl.NumberFormat('en-IN', format), [format]);
  // Whole-number counts stay whole mid-animation (Intl defaults to 3 decimal places).
  const fractionDigits =
    Number.isInteger(value) && Number.isInteger(from)
      ? 0
      : (formatter.resolvedOptions().maximumFractionDigits ?? 0);
  const textRef = useRef<HTMLSpanElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(wrapperRef, { once: true, amount: 0.2 });
  const reduced = useShouldReduceMotion();
  const shown = useRef(value);
  const pendingFirstCount = useRef(false);

  const render = (current: number) => {
    const factor = 10 ** fractionDigits;
    shown.current = current;
    if (textRef.current) {
      textRef.current.textContent = formatter.format(Math.round(current * factor) / factor);
    }
  };

  // Before the first paint after hydration: hide the final number only if it's off-screen.
  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element || reduced) return;
    const rect = element.getBoundingClientRect();
    const offScreen = rect.top > window.innerHeight || rect.bottom < 0;
    if (offScreen) {
      pendingFirstCount.current = true;
      render(from);
    }
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced) {
      pendingFirstCount.current = false;
      render(value);
      return;
    }
    if (pendingFirstCount.current && !inView) return;
    const first = pendingFirstCount.current;
    pendingFirstCount.current = false;
    if (shown.current === value) return;
    const controls = animate(shown.current, value, {
      duration: first ? FIRST_DURATION : duration.slow,
      ease: ease.out,
      onUpdate: render,
    });
    return () => controls.stop();
    // `render` only depends on formatter/fractionDigits, captured via value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduced, formatter]);

  const finalText = formatter.format(value);
  return (
    <span ref={wrapperRef} className={`inline-grid tabular-nums ${className ?? ''}`}>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {finalText}
      </span>
      <span ref={textRef} aria-hidden className="col-start-1 row-start-1">
        {finalText}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}
