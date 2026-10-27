import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { API_URL } from './api';

/**
 * Better Auth's client for /v1/auth (decision 010: these routes answer in Better Auth's own
 * error format). Everything else goes through `apiFetch`.
 */
export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/v1/auth',
  fetchOptions: { credentials: 'include' },
  plugins: [emailOTPClient()],
});

/** Google sign-in shows only when the API has Google credentials (NEXT_PUBLIC_GOOGLE_SIGN_IN). */
export const GOOGLE_SIGN_IN = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === 'true';

/** Better Auth error codes the sign-in screens explain in their own words. */
export type AuthErrorKey =
  'invalidCode' | 'expiredCode' | 'tooManyAttempts' | 'rateLimited' | 'unreachable' | 'generic';

/** What a failed auth call reports; status 0 means the API never answered. */
export interface AuthCallError {
  status?: number;
  code?: string;
}

/**
 * Runs an auth client call and always settles: a network failure (API down, CORS, offline)
 * becomes `{ status: 0 }` instead of a thrown error, so the screen can say so.
 */
export async function callAuth(
  call: () => Promise<{ error: AuthCallError | null }>,
): Promise<{ error: AuthCallError | null }> {
  try {
    const { error } = await call();
    return { error };
  } catch {
    return { error: { status: 0 } };
  }
}

export function authErrorKey(error: AuthCallError | null): AuthErrorKey {
  if (!error) return 'generic';
  if (error.status === 0) return 'unreachable';
  if (error.status === 429) return 'rateLimited';
  switch (error.code) {
    case 'INVALID_OTP':
      return 'invalidCode';
    case 'OTP_EXPIRED':
      return 'expiredCode';
    case 'TOO_MANY_ATTEMPTS':
      return 'tooManyAttempts';
    default:
      return 'generic';
  }
}
