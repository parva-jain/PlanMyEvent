'use client';

import { m, type Variants } from 'motion/react';
import { Children, createContext, use, type ReactNode } from 'react';

import { distance, duration, ease, maxStaggeredRows, stagger } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

/** Portion of the element that must be visible before it reveals (MOTION.md: 20%). */
const VIEWPORT_AMOUNT = 0.2;

interface GroupState {
  step: number;
  /** Position of this child within its group. */
  index: number;
}

const GroupContext = createContext<GroupState | null>(null);

function revealVariants(rise: number, reduced: boolean, delay: number): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : rise },
    visible: {
      opacity: 1,
      y: 0,
      transition: reduced
        ? { duration: duration.fast, ease: ease.out, delay }
        : { duration: duration.base, ease: ease.out, delay },
    },
  };
}

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Rise distance: `rise` for content, `riseLarge` for headings. */
  rise?: 'rise' | 'riseLarge';
  /** Extra delay in seconds, e.g. a subheading following its headline. */
  delay?: number;
}

/**
 * Fades in and rises when it enters the viewport, once (MOTION.md section 4).
 * Inside a RevealGroup it follows the group's trigger and stagger instead.
 * Reduced motion: opacity only, `fast`.
 */
export function Reveal({ children, className, rise = 'rise', delay = 0 }: RevealProps) {
  const reduced = useShouldReduceMotion();
  const group = use(GroupContext);
  const staggerDelay = group ? Math.min(group.index, maxStaggeredRows - 1) * group.step : 0;
  const variants = revealVariants(distance[rise], reduced, delay + staggerDelay);

  if (group) {
    // Variants propagate from the group, which owns the in-view trigger.
    return (
      <m.div className={className} variants={variants}>
        {children}
      </m.div>
    );
  }

  return (
    <m.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: VIEWPORT_AMOUNT }}
    >
      {children}
    </m.div>
  );
}

interface RevealGroupProps {
  children: ReactNode;
  className?: string;
  /** `section` (80 ms) for marketing cards and steps, `list` (40 ms) for rows in the app. */
  pace?: 'section' | 'list';
}

/**
 * Staggers its Reveal children when the group enters the viewport. In list pace only the
 * first 8 rows stagger; the rest appear with the 8th (MOTION.md section 2).
 */
export function RevealGroup({ children, className, pace = 'section' }: RevealGroupProps) {
  const step = stagger[pace];
  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: VIEWPORT_AMOUNT }}
    >
      {Children.map(children, (child, index) => (
        <GroupContext value={{ step, index }}>{child}</GroupContext>
      ))}
    </m.div>
  );
}
