'use client';

import { useAnimate, useInView, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ease } from '@/lib/motion';

import { useHydrated } from '@/lib/use-hydrated';

import { useShouldReduceMotion } from './motion-provider';

// MOTION.md section 4: y ±6 px over 6 s, marketing only.
const DRIFT_PX = 6;
const LOOP_SECONDS = 6;

interface AmbientFloatProps {
  children: ReactNode;
  /** Phase offset in seconds so neighbouring cards don't move in step. */
  offset?: number;
  className?: string;
}

/**
 * Gentle vertical drift loop for marketing cards. Pauses on hover and keyboard focus and
 * stops while off-screen (WCAG 2.2.2); static under reduced motion.
 */
export function AmbientFloat({ children, offset = 0, className }: AmbientFloatProps) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const inView = useInView(scope);
  const reduced = useShouldReduceMotion();
  // Wait for hydration: until then `reduced` is always false, and an animation started
  // then and stopped a moment later would freeze mid-way.
  const hydrated = useHydrated();
  const [held, setHeld] = useState(false);
  const controls = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (reduced) return;
    const loop = animate(
      scope.current,
      { y: [0, -DRIFT_PX, 0, DRIFT_PX, 0] },
      { duration: LOOP_SECONDS, ease: ease.inOut, repeat: Infinity },
    );
    loop.time = offset % LOOP_SECONDS;
    loop.pause();
    controls.current = loop;
    return () => {
      loop.stop();
      controls.current = null;
    };
  }, [animate, scope, offset, reduced, hydrated]);

  useEffect(() => {
    const loop = controls.current;
    if (!loop) return;
    if (inView && !held) loop.play();
    else loop.pause();
  }, [inView, held, reduced, hydrated]);

  return (
    <div
      ref={scope}
      className={className}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
    >
      {children}
    </div>
  );
}
