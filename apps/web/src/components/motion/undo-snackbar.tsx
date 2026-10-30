'use client';

import { X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { distance, duration, ease } from '@/lib/motion';

import { useShouldReduceMotion } from './motion-provider';

/** How long Undo stays offered; matches the countdown bar in motion.css. */
export const UNDO_WINDOW_MS = 5_000;

interface SnackbarInput {
  message: ReactNode;
  /** Shows an Undo button; the snackbar closes when it resolves, or says it failed. */
  onUndo?: () => Promise<unknown>;
}

const Context = createContext<((input: SnackbarInput) => void) | null>(null);

/** Where snackbars appear: one at a time, a new one replaces the last. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(SnackbarInput & { id: number }) | null>(null);
  const counter = useRef(0);
  const show = useCallback((input: SnackbarInput) => {
    counter.current += 1;
    setCurrent({ ...input, id: counter.current });
  }, []);
  const id = current?.id;
  const dismiss = useCallback(() => setCurrent((shown) => (shown?.id === id ? null : shown)), [id]);

  return (
    <Context value={show}>
      {children}
      {/* Above the phone bottom bar and the + button; bottom corner on desktop. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center sm:bottom-24 lg:bottom-6">
        <AnimatePresence>
          {current && <UndoSnackbar key={current.id} {...current} onDismiss={dismiss} />}
        </AnimatePresence>
      </div>
    </Context>
  );
}

/** Shows a snackbar, e.g. "Haldi deleted · Undo" (DESIGN.md "Feedback"). */
export function useSnackbar(): (input: SnackbarInput) => void {
  const show = use(Context);
  if (!show) throw new Error('useSnackbar must be used inside <SnackbarProvider>');
  return show;
}

/**
 * UndoSnackbar (MOTION.md section 4): slides up 16 px with a fade (`base` in, `fast` out),
 * and a countdown bar shrinks over 5 s. Hovering or focusing it pauses the countdown (WCAG
 * 2.2.1). Reduced motion: fade only, no bar.
 */
function UndoSnackbar({ message, onUndo, onDismiss }: SnackbarInput & { onDismiss: () => void }) {
  const t = useTranslations('app.snackbar');
  const reduced = useShouldReduceMotion();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState<'open' | 'undoing' | 'failed'>('open');
  const remaining = useRef(UNDO_WINDOW_MS);
  const paused = hovered || focused || state === 'undoing';

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [paused, onDismiss]);

  function undo() {
    if (!onUndo) return;
    setState('undoing');
    onUndo().then(onDismiss, () => {
      // Leave the error up for a whole window.
      remaining.current = UNDO_WINDOW_MS;
      setState('failed');
    });
  }

  const offset = reduced ? 0 : distance.toast;
  return (
    <m.div
      role="status"
      data-testid="snackbar"
      className="pointer-events-auto relative flex w-full max-w-md items-center gap-2 overflow-hidden rounded-card bg-fg py-2 pr-2 pl-4 text-background shadow-raised"
      initial={{ opacity: 0, y: offset }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: reduced ? duration.fast : duration.base, ease: ease.out },
      }}
      exit={{ opacity: 0, y: offset, transition: { duration: duration.fast, ease: ease.in } }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <p className="flex-1 py-2 text-small">{state === 'failed' ? t('undoFailed') : message}</p>
      {onUndo && state !== 'failed' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-primary-tint hover:bg-background/10"
          loading={state === 'undoing'}
          onClick={undo}
        >
          {t('undo')}
        </Button>
      )}
      <button
        type="button"
        aria-label={t('dismiss')}
        onClick={onDismiss}
        className="flex size-10 shrink-0 items-center justify-center rounded-control hover:bg-background/10"
      >
        <X aria-hidden className="size-4" />
      </button>
      {state === 'open' && (
        <span
          aria-hidden
          className="snackbar-countdown absolute inset-x-0 bottom-0 h-0.5 bg-primary-tint"
          data-paused={paused ? '' : undefined}
        />
      )}
    </m.div>
  );
}
