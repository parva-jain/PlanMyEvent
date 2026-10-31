'use client';

import type { PublicInvite, Rsvp } from '@pme/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';

/** A guest's own invitation, by the token in their link. */
export const inviteKeys = { page: (token: string) => ['invite', token] as const };

const path = (token: string) => `/v1/public/invites/${encodeURIComponent(token)}` as const;

/**
 * GET /v1/public/invites/{token}. A 404 (unknown or regenerated link) or 410 (withdrawn)
 * won't change on a retry, so only other failures are retried.
 */
export function useInvite(token: string) {
  return useQuery({
    queryKey: inviteKeys.page(token),
    queryFn: () => apiFetch<PublicInvite>(path(token)),
    retry: (count, error) =>
      !(error instanceof ApiError && [404, 410, 429].includes(error.status)) && count < 2,
    refetchOnWindowFocus: false,
  });
}

/**
 * POST …/rsvp. Each send gets its own Idempotency-Key (a changed answer is a new request);
 * React Query's retries of that send reuse it, so a flaky network can't answer twice.
 * The response is the page with the new answers.
 */
export function useRsvp(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: Rsvp; idempotencyKey: string }) =>
      apiFetch<PublicInvite>(`${path(token)}/rsvp`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    retry: (count, error) =>
      (!(error instanceof ApiError) ||
        error.status >= 500 ||
        error.problem?.code === 'request_in_progress') &&
      count < 3,
    retryDelay: 1000,
    onSuccess: (page) => queryClient.setQueryData(inviteKeys.page(token), page),
  });
}
