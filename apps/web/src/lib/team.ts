'use client';

import type {
  AcceptedMemberInvite,
  CreatedMemberInvite,
  CreateMemberInvite,
  CreateRole,
  Grant,
  Member,
  MemberInvite,
  MemberInvitePreview,
  MyMembership,
  Role,
  TransferOwnership,
  UpdateRole,
} from '@pme/contracts';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError } from './api';
import { eventKeys } from './events';

interface List<T> {
  data: T[];
}

export const teamKeys = {
  me: (eventId: string) => ['events', eventId, 'me'] as const,
  members: (eventId: string) => ['events', eventId, 'members'] as const,
  roles: (eventId: string) => ['events', eventId, 'roles'] as const,
  invites: (eventId: string) => ['events', eventId, 'member-invites'] as const,
  preview: (token: string) => ['member-invite', token] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;
const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

// ---- Reads -------------------------------------------------------------------------------

/** GET E/me: my member record and effective permissions (the UI's copy of the guard's). */
export function useMyMembership(eventId: string) {
  return useQuery({
    queryKey: teamKeys.me(eventId),
    queryFn: () => apiFetch<MyMembership>(`${E(eventId)}/me`),
  });
}

export const membersQuery = (eventId: string) =>
  queryOptions({
    queryKey: teamKeys.members(eventId),
    queryFn: async () => (await apiFetch<List<Member>>(`${E(eventId)}/members`)).data,
  });

export function useMembers(eventId: string) {
  return useQuery(membersQuery(eventId));
}

export function useRoles(eventId: string) {
  return useQuery({
    queryKey: teamKeys.roles(eventId),
    queryFn: async () => (await apiFetch<List<Role>>(`${E(eventId)}/roles`)).data,
  });
}

export function useMemberInvites(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: teamKeys.invites(eventId),
    queryFn: async () => (await apiFetch<List<MemberInvite>>(`${E(eventId)}/member-invites`)).data,
    enabled,
  });
}

/** GET /v1/member-invites/{token}: works signed out. 404 and 410 are answers, not retries. */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: teamKeys.preview(token),
    queryFn: () => apiFetch<MemberInvitePreview>(`/v1/member-invites/${token}`),
    retry: (count, error) => !(error instanceof ApiError) && count < 2,
  });
}

// ---- Writes ------------------------------------------------------------------------------

/**
 * Anything about the team can change my own permissions too (my roles, a role I hold), so
 * team writes refresh my membership along with the lists. Not awaited: the caller's
 * onSuccess (closing a panel, navigating) shouldn't wait for three refetches.
 */
function useInvalidateTeam(eventId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      teamKeys.members(eventId),
      teamKeys.roles(eventId),
      teamKeys.me(eventId),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function useCreateInvite(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateMemberInvite) =>
      apiFetch<CreatedMemberInvite>(`${E(eventId)}/member-invites`, { method: 'POST', body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: teamKeys.invites(eventId) }),
  });
}

export function useRevokeInvite(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiFetch<null>(`${E(eventId)}/member-invites/${inviteId}`, { method: 'DELETE' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: teamKeys.invites(eventId) }),
  });
}

export function useReplaceMemberRoles(eventId: string) {
  const invalidate = useInvalidateTeam(eventId);
  return useMutation({
    mutationFn: ({ member, assignments }: { member: Member; assignments: Grant[] }) =>
      apiFetch<Member>(`${E(eventId)}/members/${member.id}/roles`, {
        method: 'PUT',
        body: { assignments },
        headers: ifMatch(member.version),
      }),
    onSettled: invalidate,
  });
}

export function useRemoveMember(eventId: string) {
  const invalidate = useInvalidateTeam(eventId);
  return useMutation({
    mutationFn: (member: Member) =>
      apiFetch<null>(`${E(eventId)}/members/${member.id}`, {
        method: 'DELETE',
        headers: ifMatch(member.version),
      }),
    onSettled: invalidate,
  });
}

export function useTransferOwnership(eventId: string) {
  const invalidate = useInvalidateTeam(eventId);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TransferOwnership) =>
      apiFetch<Member>(`${E(eventId)}/transfer-ownership`, { method: 'POST', body }),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: eventKeys.mine });
    },
  });
}

export function useLeaveEvent(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>(`${E(eventId)}/leave`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: eventKeys.mine }),
  });
}

export function useSaveRole(eventId: string) {
  const invalidate = useInvalidateTeam(eventId);
  return useMutation({
    mutationFn: (input: { role: Role; changes: UpdateRole } | { create: CreateRole }) =>
      'create' in input
        ? apiFetch<Role>(`${E(eventId)}/roles`, { method: 'POST', body: input.create })
        : apiFetch<Role>(`${E(eventId)}/roles/${input.role.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.role.version),
          }),
    onSettled: invalidate,
  });
}

export function useDeleteRole(eventId: string) {
  const invalidate = useInvalidateTeam(eventId);
  return useMutation({
    mutationFn: (role: Role) =>
      apiFetch<null>(`${E(eventId)}/roles/${role.id}`, {
        method: 'DELETE',
        headers: ifMatch(role.version),
      }),
    onSettled: invalidate,
  });
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<AcceptedMemberInvite>(`/v1/member-invites/${token}/accept`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: eventKeys.mine }),
  });
}

/** The join link for a token, on this web app's origin. */
export const joinUrl = (token: string) =>
  `${typeof window === 'undefined' ? '' : window.location.origin}/join/${token}`;
