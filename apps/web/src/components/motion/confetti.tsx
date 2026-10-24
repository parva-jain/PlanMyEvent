'use client';

import { useCallback } from 'react';

import { useShouldReduceMotion } from './motion-provider';

/** Brand marigold (MOTION.md section 3: marigold and the event accent only). */
const MARIGOLD = '#F5A524';
const ONCE_PREFIX = 'pme:confetti:';

interface FireOptions {
  /** Element the burst comes from; defaults to the centre of the screen. */
  origin?: HTMLElement | null;
  /** Event accent hex, added to marigold. */
  accent?: string;
  /** Milestone id: the burst plays once per milestone in this browser (MOTION.md principle 5). */
  onceKey?: string;
}

function alreadyCelebrated(onceKey: string | undefined): boolean {
  if (!onceKey) return false;
  try {
    if (localStorage.getItem(ONCE_PREFIX + onceKey)) return true;
    localStorage.setItem(ONCE_PREFIX + onceKey, '1');
  } catch {
    // Storage blocked: celebrate anyway rather than never.
  }
  return false;
}

/**
 * Short marigold burst from an element: 40 particles, about 1 s (MOTION.md section 4).
 * canvas-confetti is loaded on first use, so it adds nothing to the initial bundle.
 * Nothing fires under reduced motion (OS setting or the /dev/ui override); the success
 * message that accompanies it must carry the information on its own.
 */
export function useConfetti() {
  const reduced = useShouldReduceMotion();

  return useCallback(
    async ({ origin, accent, onceKey }: FireOptions = {}) => {
      if (reduced || alreadyCelebrated(onceKey)) return;
      const { default: confetti } = await import('canvas-confetti');
      const rect = origin?.getBoundingClientRect();
      await confetti({
        particleCount: 40,
        spread: 70,
        startVelocity: 32,
        ticks: 70, // about 1 s at 60 fps
        gravity: 1.1,
        scalar: 0.9,
        colors: accent ? [MARIGOLD, accent] : [MARIGOLD],
        origin: rect
          ? {
              x: (rect.left + rect.width / 2) / window.innerWidth,
              y: (rect.top + rect.height / 2) / window.innerHeight,
            }
          : { x: 0.5, y: 0.5 },
        disableForReducedMotion: true,
      });
    },
    [reduced],
  );
}
