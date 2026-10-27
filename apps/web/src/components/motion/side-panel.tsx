'use client';

import { X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useMediaQuery } from '@/lib/use-media-query';
import { distance, duration, ease, spring } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';
import { Sheet } from './sheet';

interface PanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
}

/**
 * SidePanel (MOTION.md section 4): a 420 px panel slides in 24 px from the right with a
 * fade on the `gentle` spring, and the list behind dims slightly. Radix Dialog handles
 * focus, Escape and aria. Reduced motion: fade only, `fast`.
 */
export function SidePanel({ open, onOpenChange, title, children }: PanelProps) {
  const t = useTranslations('app');
  const reduced = useShouldReduceMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-50 bg-fg/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? duration.fast : duration.base, ease: ease.out }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <m.div
                data-slot="side-panel"
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-surface text-fg shadow-raised outline-none"
                initial={{ opacity: 0, x: reduced ? 0 : distance.riseLarge }}
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: reduced ? 0 : distance.riseLarge,
                  transition: { duration: reduced ? duration.fast : duration.base, ease: ease.in },
                }}
                transition={reduced ? { duration: duration.fast, ease: ease.out } : spring.gentle}
              >
                <div className="flex h-16 items-center gap-3 border-b border-border px-6">
                  <Dialog.Title className="text-h3">{title}</Dialog.Title>
                  <Dialog.Close
                    className="ml-auto flex size-10 items-center justify-center rounded-control text-fg-secondary hover:bg-surface-muted"
                    aria-label={t('close')}
                  >
                    <X aria-hidden className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto p-6">{children}</div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** DESIGN.md "Quick edit": side panel on desktop, bottom sheet on phone and tablet. */
export function EditPanel(props: PanelProps) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  return desktop ? (
    <SidePanel {...props} />
  ) : (
    <Sheet {...props}>
      <div className="px-2 pb-2">{props.children}</div>
    </Sheet>
  );
}
