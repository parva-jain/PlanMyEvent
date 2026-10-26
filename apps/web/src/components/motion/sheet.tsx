'use client';

import { AnimatePresence, m, type PanInfo } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useRef, type ReactNode } from 'react';

import { duration, ease, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

import { useShouldReduceMotion } from './motion-provider';

/** Dismiss when dragged down past this share of the sheet's height… */
const DISMISS_DISTANCE = 0.3;
/** …or flicked down faster than this (px/s). */
const DISMISS_VELOCITY = 500;

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Visible heading; also the dialog's accessible name. */
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Bottom sheet (MOTION.md section 4): slides up from 100% with a backdrop fade (`gentle`
 * spring in, 200 ms `in` out); drag down past 30% or flick to dismiss. Radix Dialog
 * provides focus trapping, Escape and aria. Reduced motion: opacity only, `fast`.
 */
export function Sheet({ open, onOpenChange, title, children, className }: SheetProps) {
  const reduced = useShouldReduceMotion();
  const sheetRef = useRef<HTMLDivElement>(null);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const height = sheetRef.current?.offsetHeight ?? Infinity;
    if (info.offset.y > height * DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) {
      onOpenChange(false);
    }
  };

  const hidden = reduced ? { opacity: 0 } : { y: '100%' };
  const shown = reduced ? { opacity: 1 } : { y: 0 };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-fg/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: duration.base, ease: ease.in } }}
                transition={{ duration: reduced ? duration.fast : duration.base, ease: ease.out }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <m.div
                ref={sheetRef}
                data-slot="sheet"
                className={cn(
                  'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-sheet border-t border-border bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] text-fg shadow-raised outline-none',
                  className,
                )}
                initial={hidden}
                animate={shown}
                exit={{
                  ...hidden,
                  transition: { duration: reduced ? duration.fast : duration.base, ease: ease.in },
                }}
                transition={reduced ? { duration: duration.fast, ease: ease.out } : spring.gentle}
                drag={reduced ? false : 'y'}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 1 }}
                onDragEnd={onDragEnd}
              >
                <div aria-hidden className="mx-auto mt-3 h-1 w-10 rounded-full bg-border-strong" />
                <Dialog.Title className="px-4 pt-4 pb-2 text-h3">{title}</Dialog.Title>
                <div className="overflow-y-auto px-2">{children}</div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export const SheetClose = Dialog.Close;
