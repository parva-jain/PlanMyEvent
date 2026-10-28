import { createHash, randomBytes } from 'node:crypto';

import {
  jobId,
  type AcceptedMemberInvite,
  type CreatedMemberInvite,
  type CreateMemberInvite,
  type EmailJob,
  type Grant,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx, LockedMemberInvite } from '../ports.js';
import { actorAccess, checkGrants, userIdOf } from './access.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Member invite links carry 32 random bytes; only the SHA-256 is stored (CLAUDE.md rule 6). */
export const hashInviteToken = (token: string): Buffer =>
  createHash('sha256').update(token).digest();

/** "priya.sharma@gmail.com" → "pr***@gmail.com": enough to pick the right account. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}***@${domain}`;
}

/**
 * POST E/member-invites (members.manage): an email invite (single use, emailed through the
 * outbox) or a shareable link. The token is returned once; the caller shows or shares it.
 */
export const createMemberInvite: ActionDefinition<
  { body: CreateMemberInvite; linkBase: string; inviterName: string },
  CreatedMemberInvite,
  CoreTx
> = {
  name: 'memberInvites.create',
  permission: 'members.manage',
  async execute(tx, ctx, { body, linkBase, inviterName }) {
    const eventId = ctx.eventId!;
    await checkGrants(tx, eventId, await actorAccess(tx, ctx), body.grants);
    const token = randomBytes(32).toString('base64url');
    const invite = await tx.memberInvites.insert(eventId, {
      tokenHash: hashInviteToken(token),
      email: body.email?.toLowerCase() ?? null,
      grants: body.grants,
      maxUses: body.maxUses,
      expiresAt: new Date(ctx.now.getTime() + body.expiresInDays * DAY_MS),
      createdByUserId: userIdOf(ctx),
    });

    const outbox = [];
    if (invite.email) {
      const event = await tx.events.find(eventId);
      const payload: EmailJob = {
        template: 'member-invite',
        to: invite.email,
        eventName: event!.name,
        inviterName,
        url: `${linkBase}${token}`,
        expiresAt: invite.expiresAt,
      };
      outbox.push({
        topic: 'email.critical',
        dedupeKey: jobId('member-invite', invite.id),
        payload,
      });
    }
    return {
      result: { ...invite, token },
      activity: [
        // The token never goes into the log.
        {
          action: 'create',
          entityType: 'member_invite',
          entityId: invite.id,
          before: null,
          after: invite,
        },
      ],
      outbox,
    };
  },
};

/** DELETE E/member-invites/{inviteId} (members.manage). */
export const revokeMemberInvite: ActionDefinition<{ inviteId: string }, void, CoreTx> = {
  name: 'memberInvites.revoke',
  permission: 'members.manage',
  async execute(tx, ctx, { inviteId }) {
    if (!(await tx.memberInvites.revoke(ctx.eventId!, inviteId))) {
      throw new ActionError('not_found', 'Invite not found');
    }
    return {
      result: undefined,
      activity: [
        {
          action: 'revoke',
          entityType: 'member_invite',
          entityId: inviteId,
          before: null,
          after: null,
        },
      ],
    };
  },
};

/** Why a link no longer works, or null if it does. Shared with the preview. */
export function inviteProblem(invite: LockedMemberInvite | null, now: Date): ActionError | null {
  if (!invite) return new ActionError('not_found', 'This invite link is not valid');
  if (invite.revoked) return new ActionError('link_revoked', 'This invite was cancelled');
  if (new Date(invite.expiresAt) <= now || invite.usedCount >= invite.maxUses) {
    return new ActionError('link_expired', 'This invite has expired or was already used');
  }
  return null;
}

/**
 * The invite's grants as they stand now (DatabaseDesign: "re-validated then"): deleted
 * sub-events drop out of scopes, a scoped grant left with none is dropped rather than widened,
 * and so is a deleted role. The inviter must still hold members.manage and cover them.
 */
async function currentGrants(tx: CoreTx, invite: LockedMemberInvite): Promise<Grant[]> {
  const grants: Grant[] = [];
  for (const grant of invite.grants) {
    const role = await tx.roles.find(invite.eventId, grant.roleId);
    if (!role || role.isOwner) continue;
    const subEventIds = [];
    for (const id of grant.subEventIds) {
      if (await tx.subEvents.find(invite.eventId, id)) subEventIds.push(id);
    }
    if (grant.subEventIds.length && !subEventIds.length) continue;
    grants.push({ roleId: grant.roleId, subEventIds });
  }
  const revoked = new ActionError('link_revoked', 'This invite is no longer valid');
  const inviter = await tx.access.forUser(invite.eventId, invite.createdByUserId);
  if (!grants.length || !inviter?.wholeEvent.includes('members.manage')) throw revoked;
  try {
    await checkGrants(tx, invite.eventId, inviter, grants);
  } catch {
    throw revoked;
  }
  return grants;
}

/**
 * POST /v1/member-invites/{token}/accept (signed in). Locks the invite so used_count can't
 * pass max_uses; email invites need the invited address. Already a member: nothing changes.
 */
export const acceptMemberInvite: ActionDefinition<
  { token: string; userEmail: string },
  AcceptedMemberInvite,
  CoreTx
> = {
  name: 'memberInvites.accept',
  permission: null,
  async execute(tx, ctx, { token, userEmail }) {
    const userId = userIdOf(ctx);
    const invite = await tx.memberInvites.lockByTokenHash(hashInviteToken(token));
    const problem = inviteProblem(invite, ctx.now);
    if (problem) throw problem;
    const { eventId } = invite!;
    if (!(await tx.events.find(eventId))) throw new ActionError('not_found', 'Event not found');
    if (invite!.email && invite!.email !== userEmail.toLowerCase()) {
      throw new ActionError('forbidden', 'This invite was sent to a different email address', {
        emailHint: maskEmail(invite!.email),
      });
    }

    const existing = await tx.members.findByUser(eventId, userId);
    if (existing?.status === 'active') return { result: { eventId, joined: false } };

    const grants = await currentGrants(tx, invite!);
    const member = await tx.members.join(eventId, userId, invite!.createdByUserId);
    await tx.members.replaceAssignments(eventId, member.id, grants, invite!.createdByUserId);
    await tx.memberInvites.recordUse(invite!.id);
    await tx.access.bumpRolesVersion(eventId);
    const after = await tx.members.find(eventId, member.id);
    return {
      result: { eventId, joined: true },
      activity: [
        { action: 'join', entityType: 'member', entityId: member.id, before: null, after },
      ],
    };
  },
};
