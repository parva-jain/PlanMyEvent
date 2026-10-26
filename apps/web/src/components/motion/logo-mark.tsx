'use client';

import { useAnimate } from 'motion/react';
import { useEffect } from 'react';

import { LOGO_INTRO_STORAGE_KEY } from '@/lib/logo-intro';

import { useHydrated } from '@/lib/use-hydrated';

import { useShouldReduceMotion } from './motion-provider';

// Timings and curves copied from brand/logo/mark-animated.svg (BRAND.md: ~1.2 s, once).
const TILE = { duration: 0.35, ease: [0.3, 1.4, 0.5, 1] as const };
const TICK = { duration: 0.5, delay: 0.3, ease: [0.6, 0, 0.3, 1] as const };
const SPARKLE = { duration: 0.4, delay: 0.78, ease: [0.3, 1.5, 0.5, 1] as const };

interface LogoMarkProps {
  /** Rendered size in px. */
  size?: number;
  /**
   * `session`: play once per browser session (header). `always`: play on every mount
   * (/dev/ui replay). `static`: never animate (footer, small sizes).
   */
  play?: 'session' | 'always' | 'static';
  className?: string;
  /** Accessible name; omit when a visible wordmark sits next to it. */
  title?: string;
}

/**
 * The Plan My Event mark: tile pops, tick draws, sparkle pops (MOTION.md section 4).
 * Same shapes and brand colours as brand/logo/mark.svg and mark-dark.svg; never recoloured.
 * Reduced motion: the finished logo, no animation.
 */
export function LogoMark({ size = 32, play = 'session', className, title }: LogoMarkProps) {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const reduced = useShouldReduceMotion();
  // Wait for hydration: until then `reduced` is always false, and an animation started
  // then and stopped a moment later would freeze mid-way.
  const hydrated = useHydrated();
  const intro = play === 'session' ? 'logo-intro-part' : '';

  useEffect(() => {
    if (!hydrated) return;
    if (play === 'static') return;
    const root = document.documentElement;
    const pending = root.dataset.logoIntro === 'pending';
    if (play === 'session' && !pending) return;

    const finish = () => {
      if (play === 'session') {
        delete root.dataset.logoIntro;
        try {
          sessionStorage.setItem(LOGO_INTRO_STORAGE_KEY, '1');
        } catch {
          // Private mode or blocked storage: the intro may simply play again.
        }
      }
    };

    if (reduced) {
      finish();
      return;
    }

    const controls = [
      animate('[data-part="tile"]', { scale: [0.4, 1.06, 1], opacity: [0, 1, 1] }, TILE),
      animate('[data-part="tick"]', { pathLength: [0, 1], opacity: [1, 1] }, TICK),
      animate(
        '[data-part="sparkle"]',
        { scale: [0, 1.25, 1], rotate: [-60, 8, 0], opacity: [1, 1, 1] },
        SPARKLE,
      ),
    ];
    void Promise.all(controls).then(finish);
    return () => controls.forEach((control) => control.stop());
  }, [animate, play, reduced, hydrated]);

  return (
    <svg
      ref={scope}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <rect
        data-part="tile"
        x="4"
        y="14"
        width="45"
        height="45"
        rx="13"
        strokeWidth="1.5"
        className={`origin-center fill-[#4338CA] stroke-transparent [transform-box:fill-box] dark:fill-[#312E81] dark:stroke-[#6366F1] ${intro}`}
      />
      <polyline
        data-part="tick"
        points="14,37 24,47 49,18"
        fill="none"
        stroke="#F5A524"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={intro}
      />
      <path
        data-part="sparkle"
        d="M56 1 Q57.7 7.3 64 9 Q57.7 10.7 56 17 Q54.3 10.7 48 9 Q54.3 7.3 56 1 Z"
        fill="#F5A524"
        className={`origin-center [transform-box:fill-box] ${intro}`}
      />
    </svg>
  );
}
