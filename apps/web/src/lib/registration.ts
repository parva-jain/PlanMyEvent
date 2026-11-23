'use client';

import type { Register, RegistrationResult } from '@pme/contracts';
import { useMutation } from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';

/**
 * POST /v1/public/events/{slug}/registrations. Each send gets its own Idempotency-Key; React
 * Query's retries of that send reuse it, so a flaky network can't register twice. Turnstile
 * tokens are single-use, so a refused send needs a fresh token before trying again.
 */
export function useRegister(slug: string) {
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: Register; idempotencyKey: string }) =>
      apiFetch<RegistrationResult>(`/v1/public/events/${encodeURIComponent(slug)}/registrations`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    retry: (count, error) =>
      (!(error instanceof ApiError) ||
        error.status >= 500 ||
        error.problem?.code === 'request_in_progress') &&
      count < 2,
    retryDelay: 1000,
  });
}
