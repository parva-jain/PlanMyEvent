'use client';

import type { Me, UpdateMe } from '@pme/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';

export const ME_KEY = ['me'] as const;

/** The signed-in user, or null when signed out (401). Other errors stay errors. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await apiFetch<Me>('/v1/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: (count, error) => !(error instanceof ApiError) && count < 2,
  });
}

/** PATCH /v1/me; the cached profile updates from the response. */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateMe) => apiFetch<Me>('/v1/me', { method: 'PATCH', body: changes }),
    onSuccess: (me) => queryClient.setQueryData(ME_KEY, me),
  });
}

/** A new account from email sign-in has no name yet: the Welcome screen asks for it. */
export const needsWelcome = (me: Me) => me.user.name.trim() === '';
