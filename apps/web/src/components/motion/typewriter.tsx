'use client';

import { useInView } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useShouldReduceMotion } from './motion-provider';

// MOTION.md section 4: 35 ms per character; the caret stops 2 s after typing ends.
const CHAR_MS = 35;
const CARET_LINGER_MS = 2000;

interface TypewriterProps {
  text: string;
  className?: string;
  /** Called once the full text is shown: after typing, or at once when nothing types. */
  onDone?: () => void;
}

/**
 * Types `text` once when it comes into view, with a blinking caret.
 * - Server HTML and screen readers always get the full text.
 * - An invisible copy reserves the final size, so typing never shifts layout.
 * - Reduced motion, or text already on screen at load: the full text, no typing.
 */
export function Typewriter({ text, className, onDone }: TypewriterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useShouldReduceMotion();
  const [count, setCount] = useState(text.length);
  const [caret, setCaret] = useState(false);
  const pending = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  // Before the first paint after hydration: only hide text that starts off-screen.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || reduced) return;
    const rect = element.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) {
      pending.current = true;
      setCount(0);
    }
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced || !pending.current) {
      onDoneRef.current?.();
      return;
    }
    if (!inView) return;
    pending.current = false;
    let typed = 0;
    let lingerTimer: ReturnType<typeof setTimeout> | undefined;
    const typeTimer = setInterval(() => {
      typed += 1;
      setCount(typed);
      setCaret(true);
      if (typed >= text.length) {
        clearInterval(typeTimer);
        onDoneRef.current?.();
        lingerTimer = setTimeout(() => setCaret(false), CARET_LINGER_MS);
      }
    }, CHAR_MS);
    return () => {
      clearInterval(typeTimer);
      clearTimeout(lingerTimer);
    };
  }, [inView, reduced, text]);

  // Reduced motion always shows the full text with no caret, whatever state typing was in.
  const shown = reduced ? text : text.slice(0, count);
  const showCaret = caret && !reduced;

  return (
    <span ref={ref} className={`inline-grid ${className ?? ''}`}>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {text}
      </span>
      <span aria-hidden className="col-start-1 row-start-1">
        {shown}
        {/* A new caret element per character: a moving element counts as a layout shift,
            a newly inserted one doesn't. */}
        {showCaret && <span key={shown.length} className="typewriter-caret" />}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
