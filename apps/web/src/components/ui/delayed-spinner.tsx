'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** MOTION.md 6.1: a spinner only after 300 ms, so fast saves never flash one. */
const SPINNER_DELAY_MS = 300;

/** Shows `fallback` (usually the button's icon) until 300 ms have passed, then a spinner. */
export function DelayedSpinner({ fallback }: { fallback?: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return fallback ?? null;
  return <LoaderCircle aria-hidden className="animate-spin" strokeWidth={1.75} />;
}
