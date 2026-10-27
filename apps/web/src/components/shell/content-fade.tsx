'use client';

import { m } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { duration, ease } from '@/lib/motion';

import { useCurrentEvent } from './current-event';

/**
 * MOTION.md 6.1 and 6.9: the content area fades in (`base`) on a route change or an event
 * switch, while the sidebar and top bar stay still. Opacity only, so it is the same with
 * reduced motion.
 */
export function ContentFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { eventId } = useCurrentEvent();
  return (
    <m.div
      key={`${eventId}:${pathname}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: duration.base, ease: ease.out }}
    >
      {children}
    </m.div>
  );
}
