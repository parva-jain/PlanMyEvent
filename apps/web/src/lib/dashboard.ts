'use client';

import type { Dashboard } from '@pme/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from './api';

export const dashboardKeys = {
  /** Under the event's key, so a reconnect's "re-fetch everything on screen" includes it. */
  dashboard: (eventId: string) => ['events', eventId, 'dashboard'] as const,
};

/**
 * GET E/dashboard (APIDesign "Dashboard"). The server caches it for up to 30 s; the socket's
 * dashboard.changed re-fetches it, and the previous numbers stay on screen meanwhile so they
 * count from old to new (MOTION.md 6.5).
 */
export function useDashboard(eventId: string) {
  return useQuery({
    queryKey: dashboardKeys.dashboard(eventId),
    queryFn: () => apiFetch<Dashboard>(`/v1/events/${eventId}/dashboard`),
  });
}

/** "Nearly full": the share of capacity at which a sub-event needs attention. */
export const NEARLY_FULL = 0.9;

/** Whole-number percentage, 0 when there's nothing to divide by. */
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;
