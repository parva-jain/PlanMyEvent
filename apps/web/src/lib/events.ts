'use client';

import type {
  CreatedEvent,
  CreateEvent,
  CreateSubEvent,
  CreateVenue,
  Event,
  EventModule,
  EventTemplate,
  MyEvent,
  SubEvent,
  UpdateEvent,
  UpdateSubEvent,
  Venue,
} from '@pme/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from './api';

interface List<T> {
  data: T[];
}

/** Query keys, so mutations invalidate exactly what they change. */
export const eventKeys = {
  mine: ['events', 'mine'] as const,
  templates: ['event-templates'] as const,
  event: (eventId: string) => ['events', eventId] as const,
  modules: (eventId: string) => ['events', eventId, 'modules'] as const,
  venues: (eventId: string) => ['events', eventId, 'venues'] as const,
  subEvents: (eventId: string) => ['events', eventId, 'sub-events'] as const,
};

/** `If-Match` for a versioned write (CLAUDE.md rule 8). */
const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

const E = (eventId: string) => `/v1/events/${eventId}` as const;

// ---- Reads -------------------------------------------------------------------------------

export function useMyEvents() {
  return useQuery({
    queryKey: eventKeys.mine,
    queryFn: async () => (await apiFetch<List<MyEvent>>('/v1/me/events')).data,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: eventKeys.templates,
    queryFn: async () => (await apiFetch<List<EventTemplate>>('/v1/event-templates')).data,
    staleTime: Infinity,
  });
}

export function useEvent(eventId: string) {
  return useQuery({
    queryKey: eventKeys.event(eventId),
    queryFn: () => apiFetch<Event>(E(eventId)),
  });
}

export function useModules(eventId: string) {
  return useQuery({
    queryKey: eventKeys.modules(eventId),
    queryFn: async () => (await apiFetch<List<EventModule>>(`${E(eventId)}/modules`)).data,
  });
}

export function useVenues(eventId: string) {
  return useQuery({
    queryKey: eventKeys.venues(eventId),
    queryFn: async () => (await apiFetch<List<Venue>>(`${E(eventId)}/venues`)).data,
  });
}

export function useSubEvents(eventId: string) {
  return useQuery({
    queryKey: eventKeys.subEvents(eventId),
    queryFn: async () => (await apiFetch<List<SubEvent>>(`${E(eventId)}/sub-events`)).data,
  });
}

// ---- Writes ------------------------------------------------------------------------------

/**
 * POST /v1/events. The caller passes one Idempotency-Key per wizard session, so a retry
 * after a dropped connection returns the same event instead of creating a second one.
 */
export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateEvent; idempotencyKey: string }) =>
      apiFetch<CreatedEvent>('/v1/events', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.mine }),
  });
}

export function useUpdateEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, changes }: { version: number; changes: UpdateEvent }) =>
      apiFetch<Event>(E(eventId), { method: 'PATCH', body: changes, headers: ifMatch(version) }),
    onSuccess: (event) => {
      queryClient.setQueryData(eventKeys.event(eventId), event);
      void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
    },
  });
}

export function useReplaceModules(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ version, modules }: { version: number; modules: EventModule[] }) =>
      apiFetch<List<EventModule>>(`${E(eventId)}/modules`, {
        method: 'PUT',
        body: { modules },
        headers: ifMatch(version),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(eventKeys.modules(eventId), result.data);
      // The event's version moved on.
      void queryClient.invalidateQueries({ queryKey: eventKeys.event(eventId), exact: true });
    },
  });
}

export function useCreateVenue(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (venue: CreateVenue) =>
      apiFetch<Venue>(`${E(eventId)}/venues`, { method: 'POST', body: venue }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: eventKeys.venues(eventId) }),
  });
}

export function useDeleteVenue(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) =>
      apiFetch<null>(`${E(eventId)}/venues/${venueId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: eventKeys.venues(eventId) });
      // Its sub-events lost their venue (and moved to a new version).
      void queryClient.invalidateQueries({ queryKey: eventKeys.subEvents(eventId) });
    },
  });
}

export function useSaveSubEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { id: string; version: number; changes: UpdateSubEvent } | { create: CreateSubEvent },
    ) =>
      'create' in input
        ? apiFetch<SubEvent>(`${E(eventId)}/sub-events`, { method: 'POST', body: input.create })
        : apiFetch<SubEvent>(`${E(eventId)}/sub-events/${input.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.version),
          }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: eventKeys.subEvents(eventId) }),
  });
}

export function useDeleteSubEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      apiFetch<null>(`${E(eventId)}/sub-events/${id}`, {
        method: 'DELETE',
        headers: ifMatch(version),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: eventKeys.subEvents(eventId) }),
  });
}
