import type { Member, MemberInvite, MemberInvitePreview, MyMembership, Role } from '@pme/contracts';
import { inviteProblem, maskEmail } from '@pme/core';
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events, subEvents } from '../schema/events.js';
import { memberInvites, members } from '../schema/team.js';
import {
  listRoles,
  loadAccess,
  loadMembers,
  roleStore,
  selectInvites,
  toInvite,
  toLockedInvite,
} from '../stores/team.js';

/** Team reads for the API. Callers check access first; every query filters by event_id. */
export function teamQueries(db: Database) {
  const rolesStore = roleStore(db);

  return {
    /** Active members, oldest first (APIDesign: members.view). */
    listMembers: (eventId: string): Promise<Member[]> =>
      loadMembers(db, eventId, eq(members.status, 'active')),

    async getMember(eventId: string, memberId: string): Promise<Member | null> {
      const [member] = await loadMembers(
        db,
        eventId,
        and(eq(members.id, memberId), eq(members.status, 'active')),
      );
      return member ?? null;
    },

    /** GET E/me. */
    async myMembership(eventId: string, userId: string): Promise<MyMembership | null> {
      const access = await loadAccess(db, eventId, userId);
      if (!access) return null;
      const [member] = await loadMembers(db, eventId, eq(members.id, access.memberId));
      return {
        member: member!,
        permissions: { wholeEvent: access.wholeEvent, subEvents: access.subEvents },
      };
    },

    listRoles: (eventId: string): Promise<Role[]> => listRoles(db, eventId),
    getRole: (eventId: string, roleId: string): Promise<Role | null> =>
      rolesStore.find(eventId, roleId),

    /** Invites that can still be used: not revoked, not expired, uses left. */
    async listOpenInvites(eventId: string): Promise<MemberInvite[]> {
      const rows = await selectInvites(db)
        .where(
          and(
            eq(memberInvites.eventId, eventId),
            isNull(memberInvites.revokedAt),
            gt(memberInvites.expiresAt, sql`now()`),
            lt(memberInvites.usedCount, memberInvites.maxUses),
          ),
        )
        .orderBy(asc(memberInvites.createdAt), asc(memberInvites.id));
      return rows.map(toInvite);
    },

    /**
     * GET /v1/member-invites/{token}: what the link offers. Throws the same 404/410 errors
     * accepting would, so the join page can explain a dead link before sign-in.
     */
    async invitePreview(tokenHash: Buffer, now: Date): Promise<MemberInvitePreview> {
      const [row] = await selectInvites(db).where(eq(memberInvites.tokenHash, tokenHash));
      const invite = row ? toLockedInvite(row) : null;
      const [event] = invite
        ? await db
            .select({
              name: events.name,
              type: events.type,
              startsOn: events.startsOn,
              endsOn: events.endsOn,
            })
            .from(events)
            .where(and(eq(events.id, invite.eventId), isNull(events.deletedAt)))
        : [];
      const problem = inviteProblem(event ? invite : null, now);
      if (problem) throw problem;

      const subEventIds = invite!.grants.flatMap((grant) => grant.subEventIds);
      const names = subEventIds.length
        ? await db
            .select({ id: subEvents.id, name: subEvents.name })
            .from(subEvents)
            .where(
              and(
                eq(subEvents.eventId, invite!.eventId),
                inArray(subEvents.id, subEventIds),
                isNull(subEvents.deletedAt),
              ),
            )
        : [];
      const roles = [];
      for (const grant of invite!.grants) {
        const role = await rolesStore.find(invite!.eventId, grant.roleId);
        if (!role) continue;
        roles.push({
          name: role.name,
          subEvents: names
            .filter((item) => grant.subEventIds.includes(item.id))
            .map((item) => item.name),
        });
      }
      return {
        event: { ...event!, type: event!.type as MemberInvitePreview['event']['type'] },
        invitedBy: invite!.createdBy,
        emailHint: invite!.email ? maskEmail(invite!.email) : null,
        roles,
        expiresAt: invite!.expiresAt,
      };
    },
  };
}

export type TeamQueries = ReturnType<typeof teamQueries>;
