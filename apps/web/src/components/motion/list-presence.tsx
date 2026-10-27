'use client';

import { AnimatePresence, m } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';

import { distance, duration, ease, spring } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

/**
 * ListPresence (MOTION.md section 4): items added later fade and rise in, removed items fade
 * and collapse, and siblings reflow with `layout` on the `snappy` spring. Items already
 * there on first render don't animate (RevealGroup handles first load). Use `ListItem`
 * children with stable keys.
 */
export function ListPresence({ children, ...props }: ComponentProps<'ul'>) {
  return (
    <ul {...props}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  );
}

export function ListItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useShouldReduceMotion();
  return (
    <m.li
      layout={!reduced}
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : distance.rise }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: duration.fast } }
          : { opacity: 0, height: 0, transition: { duration: duration.base, ease: ease.in } }
      }
      transition={
        reduced
          ? { duration: duration.fast }
          : {
              layout: spring.snappy,
              opacity: { duration: duration.base },
              y: { duration: duration.base, ease: ease.out },
            }
      }
    >
      {children}
    </m.li>
  );
}
