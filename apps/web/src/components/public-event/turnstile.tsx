'use client';

import Script from 'next/script';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

/** Cloudflare's always-pass test site key, for development and tests. */
const TEST_SITE_KEY = '1x00000000000000000000AA';
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TEST_SITE_KEY;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
      size?: 'normal' | 'flexible';
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Tokens work once: get a new one after a refused send. */
  reset(): void;
}

/**
 * Cloudflare Turnstile (APIDesign "Public registration: plus Turnstile"): a privacy-friendly
 * check that the form is filled in by a person, usually without any puzzle. Reports the token
 * (or null once it expires) to the form.
 */
export function Turnstile({
  onToken,
  ref,
}: {
  onToken: (token: string | null) => void;
  ref?: Ref<TurnstileHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(() => typeof window !== 'undefined' && !!window.turnstile);
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  const mount = useCallback(() => {
    if (!box.current || !window.turnstile || widget.current) return;
    widget.current = window.turnstile.render(box.current, {
      sitekey: SITE_KEY,
      theme: 'auto',
      size: 'flexible',
      callback: (token) => report.current(token),
      'expired-callback': () => report.current(null),
      'error-callback': () => report.current(null),
    });
  }, []);

  useEffect(() => {
    if (loaded) mount();
    return () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [loaded, mount]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      report.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  return (
    <>
      <Script src={SCRIPT} strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <div ref={box} className="min-h-16" data-testid="turnstile" />
    </>
  );
}
