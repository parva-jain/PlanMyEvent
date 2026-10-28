/**
 * Where to go after signing in, carried as `?next=` through sign-in, Google and Welcome (the
 * join page sends people through sign-in this way). Only same-site paths are accepted, so a
 * crafted link can't bounce someone to another site after they sign in.
 */
export const RETURN_PARAM = 'next';

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null;
  }
  return value;
}

/** The `?next=` of the current page, read in the browser only. */
export function currentReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  return safeReturnTo(new URLSearchParams(window.location.search).get(RETURN_PARAM));
}

/** `path` with `?next=` added when there is somewhere to return to. */
export function withReturnTo(path: string, next: string | null): string {
  return next ? `${path}?${RETURN_PARAM}=${encodeURIComponent(next)}` : path;
}
