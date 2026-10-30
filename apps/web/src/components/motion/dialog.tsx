'use client';

import { AnimatePresence, m } from 'motion/react';
import { Dialog as Radix } from 'radix-ui';
import type { ReactNode } from 'react';

import { duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';
import { useReturnFocus } from './use-return-focus';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Dialog (MOTION.md section 4): scales 0.96 → 1 with a fade over `moderate`, backdrop fades.
 * Radix handles focus, Escape and aria. Reduced motion: fade only, `fast`.
 */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  const reduced = useShouldReduceMotion();
  const returnFocus = useReturnFocus(open);
  const transition = { duration: reduced ? duration.fast : duration.moderate, ease: ease.out };
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Radix.Portal forceMount>
            <Radix.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-fg/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              />
            </Radix.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Radix.Content
                asChild
                forceMount
                onCloseAutoFocus={returnFocus}
                {...(description ? {} : { 'aria-describedby': undefined })}
              >
                <m.div
                  className="pointer-events-auto flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-card border border-border bg-surface p-6 text-fg shadow-raised outline-none"
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
                  transition={transition}
                >
                  <div className="flex flex-col gap-1">
                    <Radix.Title className="text-h3">{title}</Radix.Title>
                    {description && (
                      <Radix.Description className="text-body text-fg-secondary">
                        {description}
                      </Radix.Description>
                    )}
                  </div>
                  {children}
                </m.div>
              </Radix.Content>
            </div>
          </Radix.Portal>
        )}
      </AnimatePresence>
    </Radix.Root>
  );
}

/** Closes the nearest Dialog; wrap a button with it (asChild). */
export const DialogClose = Radix.Close;
