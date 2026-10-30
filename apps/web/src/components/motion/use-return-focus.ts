'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Our dialogs open from plain buttons, not a Radix `Dialog.Trigger`, so Radix has nothing to
 * focus on close and focus falls to <body>. This remembers what had focus when the dialog
 * opened (layout effect: before Radix moves focus inside) and returns it there on close.
 * Pass the result as `onCloseAutoFocus` on `Dialog.Content`.
 */
export function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (event: Event) => {
    const target = opener.current;
    if (!target?.isConnected) return;
    event.preventDefault();
    target.focus();
  };
}
