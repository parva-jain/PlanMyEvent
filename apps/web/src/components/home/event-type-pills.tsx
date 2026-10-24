'use client';

import { useInView } from 'motion/react';
import { GraduationCap, Heart, Mic, PartyPopper, Store, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useShouldReduceMotion } from '@/components/motion/motion-provider';
import { badgeVariants } from '@/components/ui/badge';
import { useHydrated } from '@/lib/use-hydrated';
import { cn } from '@/lib/utils';

/** MOTION.md 6.2: the highlight moves every 2.2 s. */
const STEP_MS = 2200;

const PILLS = [
  { key: 'weddings', tone: 'wedding', Icon: Heart },
  { key: 'conferences', tone: 'conference', Icon: Mic },
  { key: 'collegeFests', tone: 'custom', Icon: GraduationCap },
  { key: 'exhibitions', tone: 'fair', Icon: Store },
  { key: 'meetups', tone: 'info', Icon: Users },
  { key: 'celebrations', tone: 'celebration', Icon: PartyPopper },
] as const;

/** Where the highlight starts and finally rests (MOTION.md 6.2: "stops on Conferences"). */
const REST_INDEX = 1;

/**
 * Event-type pills. The highlight starts on Conferences (also the server and reduced-motion
 * state), moves pill to pill for one full loop and stops back on Conferences. It pauses on
 * hover and focus and while off-screen.
 */
export function EventTypePills({ className }: { className?: string }) {
  const t = useTranslations('home.hero.eventTypes');
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduced = useShouldReduceMotion();
  const hydrated = useHydrated();
  const [held, setHeld] = useState(false);
  // Steps taken so far; the loop is done after one step per pill.
  const [steps, setSteps] = useState(0);
  const done = steps >= PILLS.length;
  const running = hydrated && !reduced && !done && inView && !held;
  const active = reduced ? REST_INDEX : (REST_INDEX + steps) % PILLS.length;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setSteps((s) => s + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [running, steps]);

  return (
    <div
      ref={ref}
      className={className}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
      }}
    >
      <p className="mb-3 text-caption tracking-wide text-fg-muted uppercase">{t('label')}</p>
      <ul className="flex flex-wrap gap-2">
        {PILLS.map(({ key, tone, Icon }, index) => (
          <li
            key={key}
            data-active={index === active || undefined}
            className={cn(
              badgeVariants({ tone }),
              'gap-1.5 px-3 py-1 text-label font-medium ring-0 ring-current/40 ring-offset-0',
              'transition-[box-shadow] duration-(--dur-fast) ease-(--ease-out)',
              'data-active:ring-2 data-active:ring-offset-2 data-active:ring-offset-background',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
