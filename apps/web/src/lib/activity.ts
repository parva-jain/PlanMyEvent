'use client';

import type { ActivityItem, ActivityPage, UndoResult } from '@pme/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';
import { eventKeys } from './events';
import { highlight } from './live-highlights';
import { budgetKeys } from './budget';
import { peopleKeys } from './people';
import { taskKeys } from './tasks';
import { teamKeys } from './team';

export interface ActivityFilters {
  entityType?: string;
  /** A user id: only their changes. */
  actor?: string;
}

export const activityKeys = {
  all: (eventId: string) => ['events', eventId, 'activity'] as const,
  list: (eventId: string, filters: ActivityFilters) =>
    [...activityKeys.all(eventId), filters] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;

/**
 * The queries a change to one entity type can make stale, besides the activity feed. Unknown
 * types (a module added later) refresh the whole event; only what's on screen refetches.
 */
function affected(eventId: string, entityType: string): { queryKey: QueryKey; exact?: boolean }[] {
  const event = { queryKey: eventKeys.event(eventId), exact: true };
  switch (entityType) {
    case 'event':
      return [event, { queryKey: eventKeys.mine }];
    case 'event_modules':
      return [event, { queryKey: eventKeys.modules(eventId) }];
    case 'venue':
      // Deleting a venue clears it from its sub-events.
      return [{ queryKey: eventKeys.venues(eventId) }, { queryKey: eventKeys.subEvents(eventId) }];
    case 'sub_event':
      return [{ queryKey: eventKeys.subEvents(eventId) }];
    case 'role':
      return [{ queryKey: teamKeys.roles(eventId) }, { queryKey: teamKeys.members(eventId) }];
    case 'member':
      return [{ queryKey: teamKeys.members(eventId) }, { queryKey: eventKeys.mine }];
    case 'member_invite':
      // Someone joining through an invite adds a member too.
      return [{ queryKey: teamKeys.invites(eventId) }, { queryKey: teamKeys.members(eventId) }];
    case 'task':
      return [{ queryKey: taskKeys.all(eventId) }, { queryKey: taskKeys.mine }];
    case 'budget_category':
      return [{ queryKey: budgetKeys.categories(eventId) }];
    case 'expense':
      // Category totals add up expenses.
      return [
        { queryKey: budgetKeys.expenses(eventId) },
        { queryKey: budgetKeys.categories(eventId) },
      ];
    case 'household':
    case 'contact':
    case 'invitation':
    case 'attendance':
      // Guests name each other: members of a household, the guest on an invitation, and
      // invitations carry their attendance.
      return [
        { queryKey: peopleKeys.households(eventId) },
        { queryKey: peopleKeys.contacts(eventId) },
        { queryKey: peopleKeys.invitations(eventId) },
        { queryKey: peopleKeys.attendance(eventId) },
      ];
    default:
      return [{ queryKey: eventKeys.event(eventId) }];
  }
}

/** Invalidates what a change to `entityType` touches, and the activity feed. Not awaited. */
export function invalidateEntity(queryClient: QueryClient, eventId: string, entityType: string) {
  for (const filters of [
    ...affected(eventId, entityType),
    { queryKey: activityKeys.all(eventId) },
  ]) {
    void queryClient.invalidateQueries(filters);
  }
}

// ---- Reads -------------------------------------------------------------------------------

/** GET E/activity, newest first, 50 at a time. */
export function useActivity(eventId: string, filters: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: activityKeys.list(eventId, filters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.actor) params.set('actor', filters.actor);
      if (pageParam) params.set('cursor', pageParam);
      const query = params.size ? `?${params.toString()}` : '';
      return apiFetch<ActivityPage>(`${E(eventId)}/activity${query}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : null),
    // Changing filters keeps the old list up until the new one arrives, so rows reflow.
    placeholderData: keepPreviousData,
  });
}

// ---- Writes ------------------------------------------------------------------------------

const undoEntry = (eventId: string, entryId: string) =>
  apiFetch<UndoResult>(`${E(eventId)}/activity/${entryId}/undo`, { method: 'POST' });

/** After an undo: refresh what it touched, and make it glow wherever it's on screen. */
function undone(queryClient: QueryClient, eventId: string, { entry }: UndoResult) {
  invalidateEntity(queryClient, eventId, entry.entityType);
  highlight(entry.entityId, { source: 'own', op: 'updated', actorUserId: null });
}

/** POST E/activity/{entryId}/undo, from the Activity page. */
export function useUndo(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entry: ActivityItem) => undoEntry(eventId, entry.id),
    onSuccess: (result) => undone(queryClient, eventId, result),
    // 409 already undone: the feed is out of date either way.
    onError: () => void queryClient.invalidateQueries({ queryKey: activityKeys.all(eventId) }),
  });
}

/**
 * Undoes what one of this tab's requests changed (the undo bar after a delete): finds the
 * request's entry in the entity's history by its X-Request-Id, then undoes that entry. A
 * plain function, not a mutation hook: the undo bar outlives the screen that offered it.
 */
export async function undoRequest(
  queryClient: QueryClient,
  eventId: string,
  { requestId, entityId }: { requestId: string; entityId: string },
): Promise<void> {
  const page = await apiFetch<ActivityPage>(`${E(eventId)}/activity?entityId=${entityId}&limit=10`);
  const entry = page.data.find((item) => item.requestId === requestId && item.canUndo);
  if (!entry) throw new ApiError(409, null);
  undone(queryClient, eventId, await undoEntry(eventId, entry.id));
}
