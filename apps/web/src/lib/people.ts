'use client';

import type {
  Attendance,
  BulkCreateInvitations,
  BulkCreateInvitationsResult,
  Contact,
  CreateContact,
  CreateHousehold,
  CreateInvitation,
  Household,
  Invitation,
  InvitationShare,
  JobAccepted,
  JobStatus,
  StartContactImport,
  UpdateAttendance,
  UpdateContact,
  UpdateHousehold,
  UpdateInvitation,
} from '@pme/contracts';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError, newRequestId } from './api';

interface Page<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Everything sits under the event's key, so the live fallback poll refreshes it too. */
export const peopleKeys = {
  households: (eventId: string) => ['events', eventId, 'households'] as const,
  contacts: (eventId: string) => ['events', eventId, 'contacts'] as const,
  invitations: (eventId: string) => ['events', eventId, 'invitations'] as const,
  attendance: (eventId: string) => ['events', eventId, 'attendance'] as const,
  share: (eventId: string, invitationId: string) =>
    ['events', eventId, 'invitation-share', invitationId] as const,
  job: (eventId: string, jobId: string) => ['events', eventId, 'jobs', jobId] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;
const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

/** Every row of a list endpoint, in pages of 500; screens filter and group locally. */
async function everything<T>(path: `/${string}`): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const query: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: Page<T> = await apiFetch(`${path}?limit=500${query}`);
    rows.push(...page.data);
    cursor = page.hasMore ? page.nextCursor : null;
  } while (cursor);
  return rows;
}

// ---- Reads -------------------------------------------------------------------------------

/** Households and contacts need whole-event guests.view; pass `enabled` from `can`. */
export function useHouseholds(eventId: string, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.households(eventId),
    queryFn: () => everything<Household>(`${E(eventId)}/households`),
    enabled,
  });
}

export function useContacts(eventId: string, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.contacts(eventId),
    queryFn: () => everything<Contact>(`${E(eventId)}/contacts`),
    enabled,
  });
}

/** The invitations I may see: all, my sub-events', or only the cards I hand over. */
export function useInvitations(eventId: string) {
  return useQuery({
    queryKey: peopleKeys.invitations(eventId),
    queryFn: () => everything<Invitation>(`${E(eventId)}/invitations`),
  });
}

export function useAttendance(eventId: string, enabled = true) {
  return useQuery({
    queryKey: peopleKeys.attendance(eventId),
    queryFn: () => everything<Attendance>(`${E(eventId)}/attendance`),
    enabled,
  });
}

/** The magic link and WhatsApp message; the same until the link is regenerated. */
export function useInvitationShare(eventId: string, invitationId: string | null) {
  return useQuery({
    queryKey: peopleKeys.share(eventId, invitationId ?? ''),
    queryFn: () => apiFetch<InvitationShare>(`${E(eventId)}/invitations/${invitationId}/share`),
    enabled: invitationId !== null,
    staleTime: Infinity,
  });
}

/**
 * An import's progress. job.progress signals invalidate it (see useLiveEvent); the slow
 * poll covers a socket that's down, and stops once the job is over.
 */
export function useJobStatus(eventId: string, jobId: string | null) {
  return useQuery({
    queryKey: peopleKeys.job(eventId, jobId ?? ''),
    queryFn: () => apiFetch<JobStatus>(`/v1/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'succeeded' || status === 'failed' ? false : 5_000;
    },
  });
}

// ---- Writes ------------------------------------------------------------------------------

/**
 * Guests touch each other: a contact names its household's members, invitations carry the
 * guest's name and attendance, so any guest write refreshes all four lists.
 */
export function refreshPeople(queryClient: QueryClient, eventId: string) {
  for (const key of [
    peopleKeys.households(eventId),
    peopleKeys.contacts(eventId),
    peopleKeys.invitations(eventId),
    peopleKeys.attendance(eventId),
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useSaveHousehold(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { household: Household; changes: UpdateHousehold } | { create: CreateHousehold },
    ) =>
      'create' in input
        ? apiFetch<Household>(`${E(eventId)}/households`, { method: 'POST', body: input.create })
        : apiFetch<Household>(`${E(eventId)}/households/${input.household.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.household.version),
          }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

export function useSaveContact(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { contact: Contact; changes: UpdateContact } | { create: CreateContact },
    ) =>
      'create' in input
        ? apiFetch<Contact>(`${E(eventId)}/contacts`, { method: 'POST', body: input.create })
        : apiFetch<Contact>(`${E(eventId)}/contacts/${input.contact.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.contact.version),
          }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** Deletes a household or a contact; resolves with the request id for the undo bar. */
export function useDeleteGuest(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      guest: { kind: 'household'; household: Household } | { kind: 'contact'; contact: Contact },
    ) => {
      const requestId = newRequestId();
      const [path, version] =
        guest.kind === 'household'
          ? [`households/${guest.household.id}`, guest.household.version]
          : [`contacts/${guest.contact.id}`, guest.contact.version];
      await apiFetch<null>(`${E(eventId)}/${path}`, {
        method: 'DELETE',
        headers: ifMatch(version),
        requestId,
      });
      return requestId;
    },
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

export function useCreateInvitation(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvitation) =>
      apiFetch<Invitation>(`${E(eventId)}/invitations`, { method: 'POST', body: input }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** Up to 200 at once; the key comes from the screen so a retry can't invite twice. */
export function useCreateInvitations(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      idempotencyKey,
    }: {
      body: BulkCreateInvitations;
      idempotencyKey: string;
    }) =>
      apiFetch<BulkCreateInvitationsResult>(`${E(eventId)}/invitations/bulk`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    retry: (count, error) =>
      error instanceof ApiError && error.problem?.code === 'request_in_progress' && count < 5,
    retryDelay: 1000,
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/**
 * Delivery, distributor or sub-events for one invitation. Marking delivered updates the
 * cached row at once, so the button can morph before the list re-fetches.
 */
export function useUpdateInvitation(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitation, changes }: { invitation: Invitation; changes: UpdateInvitation }) =>
      apiFetch<Invitation>(`${E(eventId)}/invitations/${invitation.id}`, {
        method: 'PATCH',
        body: changes,
        headers: ifMatch(invitation.version),
      }),
    onSuccess: (updated) =>
      queryClient.setQueryData<Invitation[]>(peopleKeys.invitations(eventId), (rows) =>
        rows?.map((row) => (row.id === updated.id ? updated : row)),
      ),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

export function useUpdateInvitations(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      invitationIds: string[];
      deliveryStatus?: Invitation['deliveryStatus'];
      distributorMemberId?: string | null;
    }) =>
      apiFetch<{ updated: Invitation[] }>(`${E(eventId)}/invitations/bulk`, {
        method: 'PATCH',
        body,
      }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** Withdraws an invitation (its answers are cancelled); resolves with the request id. */
export function useWithdrawInvitation(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitation: Invitation) => {
      const requestId = newRequestId();
      await apiFetch<null>(`${E(eventId)}/invitations/${invitation.id}`, {
        method: 'DELETE',
        headers: ifMatch(invitation.version),
        requestId,
      });
      return requestId;
    },
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** A new link; the old one stops working at once. */
export function useRegenerateLink(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitation: Invitation) =>
      apiFetch<Invitation>(`${E(eventId)}/invitations/${invitation.id}/regenerate-link`, {
        method: 'POST',
        headers: ifMatch(invitation.version),
      }),
    onSuccess: (invitation) =>
      queryClient.invalidateQueries({ queryKey: peopleKeys.share(eventId, invitation.id) }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** An organizer corrects a guest's answer or party size. */
export function useUpdateAttendance(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ row, changes }: { row: Attendance; changes: UpdateAttendance }) =>
      apiFetch<Attendance>(`${E(eventId)}/attendance/${row.id}`, {
        method: 'PATCH',
        body: changes,
        headers: ifMatch(row.version),
      }),
    onSettled: () => refreshPeople(queryClient, eventId),
  });
}

/** POST E/contacts/import: 202 with a job to follow. */
export function useStartImport(eventId: string) {
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: StartContactImport; idempotencyKey: string }) =>
      apiFetch<JobAccepted>(`${E(eventId)}/contacts/import`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    retry: (count, error) =>
      error instanceof ApiError && error.problem?.code === 'request_in_progress' && count < 5,
    retryDelay: 1000,
  });
}
