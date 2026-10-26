'use client';

import { domAnimation, LazyMotion, MotionConfig, useReducedMotionConfig } from 'motion/react';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { useHydrated } from '@/lib/use-hydrated';

/**
 * 'user' follows the OS `prefers-reduced-motion` setting (the default everywhere).
 * 'always' and 'never' are overrides, used by the /dev/ui comparison toggle.
 */
export type MotionPreference = 'user' | 'always' | 'never';

interface MotionPreferenceContext {
  preference: MotionPreference;
  setPreference: (preference: MotionPreference) => void;
}

const PreferenceContext = createContext<MotionPreferenceContext | null>(null);

/**
 * Wraps the app once (MOTION.md section 3):
 * - MotionConfig applies the reduced-motion rule to every Motion component;
 * - LazyMotion with domAnimation keeps the bundle small; `strict` forbids the heavy
 *   `motion.*` components so everything uses the lightweight `m.*` ones.
 * The override is mirrored to `data-reduced-motion` on <html> for CSS-only effects.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<MotionPreference>('user');

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'user') {
      delete root.dataset.reducedMotion;
    } else {
      root.dataset.reducedMotion = preference;
    }
  }, [preference]);

  return (
    <PreferenceContext value={{ preference, setPreference }}>
      <MotionConfig reducedMotion={preference}>
        <LazyMotion features={domAnimation} strict>
          {children}
        </LazyMotion>
      </MotionConfig>
    </PreferenceContext>
  );
}

export function useMotionPreference(): MotionPreferenceContext {
  const context = use(PreferenceContext);
  if (!context) {
    throw new Error('useMotionPreference must be used inside <MotionProvider>');
  }
  return context;
}

/**
 * True when motion should be reduced: the OS setting, unless overridden on /dev/ui.
 * Always false on the server and during hydration (the server can't know the setting),
 * so components render the same markup on both sides, then update.
 */
export function useShouldReduceMotion(): boolean {
  const hydrated = useHydrated();
  const reduced = useReducedMotionConfig() ?? false;
  return hydrated && reduced;
}
