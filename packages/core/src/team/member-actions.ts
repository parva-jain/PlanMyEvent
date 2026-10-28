import type { Member, ReplaceMemberRoles, TransferOwnership } from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { versionMismatch } from '../events/versioned.js';
import { ActionError } from '../errors.js';
import type { CoreTx } from '../ports.js';
import {
  actorAccess,
  assertCovers,
  checkGrants,
  loadGrants,
  memberPermissions,
  userIdOf,
} from './access.js';

/** An active member other than the Owner, whose permissions the actor covers. */
async function changeableMember(tx: CoreTx, ctx: ActionContext, memberId: string) {
  const eventId = ctx.eventId!;
  const member = await tx.members.find(eventId, memberId);
  if (!member || member.status !== 'active') throw new ActionError('not_found', 'Member not found');
  if (member.isOwner) {
    throw new ActionError('forbidden', "The Owner's roles change only through a transfer");
  }
  const actor = await actorAccess(tx, ctx);
  assertCovers(actor, await memberPermissions(tx, eventId, member.assignments));
  return { member, actor };
}

const reload = async (tx: CoreTx, eventId: string, memberId: string) =>
  (await tx.members.find(eventId, memberId))!;

/** PUT E/members/{memberId}/roles (members.manage, If-Match on the member). */
export const replaceMemberRoles: ActionDefinition<
  { memberId: string; expectedVersion: number; body: ReplaceMemberRoles },
  Member,
  CoreTx
> = {
  name: 'members.replaceRoles',
  permission: 'members.manage',
  async execute(tx, ctx, { memberId, expectedVersion, body }) {
    const eventId = ctx.eventId!;
    const { member: before, actor } = await changeableMember(tx, ctx, memberId);
    await checkGrants(tx, eventId, actor, body.assignments, 'assignments');
    const replaced = await tx.members.replaceAssignments(
      eventId,
      memberId,
      body.assignments,
      userIdOf(ctx),
      expectedVersion,
    );
    if (!replaced) versionMismatch(await tx.members.find(eventId, memberId), expectedVersion);
    await tx.access.bumpRolesVersion(eventId);
    const after = await reload(tx, eventId, memberId);
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'member', entityId: memberId, before, after }],
    };
  },
};

/** DELETE E/members/{memberId} (members.manage, If-Match). History stays; roles go. */
export const removeMember: ActionDefinition<
  { memberId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'members.remove',
  permission: 'members.manage',
  async execute(tx, ctx, { memberId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const { member: before } = await changeableMember(tx, ctx, memberId);
    if (!(await tx.members.remove(eventId, memberId, expectedVersion))) {
      versionMismatch(await tx.members.find(eventId, memberId), expectedVersion);
    }
    await tx.access.bumpRolesVersion(eventId);
    return {
      result: undefined,
      activity: [
        { action: 'remove', entityType: 'member', entityId: memberId, before, after: null },
      ],
    };
  },
};

/** POST E/leave (any member but the Owner, who transfers first). */
export const leaveEvent: ActionDefinition<void, void, CoreTx> = {
  name: 'members.leave',
  permission: null,
  async execute(tx, ctx) {
    const eventId = ctx.eventId!;
    const actor = await actorAccess(tx, ctx);
    if (actor.isOwner) {
      throw new ActionError('conflict', 'Transfer ownership to someone else before leaving');
    }
    const before = await reload(tx, eventId, actor.memberId);
    await tx.members.remove(eventId, actor.memberId);
    await tx.access.bumpRolesVersion(eventId);
    return {
      result: undefined,
      activity: [
        { action: 'leave', entityType: 'member', entityId: actor.memberId, before, after: null },
      ],
    };
  },
};

/**
 * POST E/transfer-ownership (Owner only, PRD rule 2). The new owner keeps their roles and
 * gains Owner; the old owner keeps the role they chose (usually Admin) for the whole event.
 */
export const transferOwnership: ActionDefinition<TransferOwnership, Member, CoreTx> = {
  name: 'members.transferOwnership',
  permission: null,
  async execute(tx, ctx, { memberId, keepRoleId }) {
    const eventId = ctx.eventId!;
    const actor = await actorAccess(tx, ctx);
    if (!actor.isOwner) throw new ActionError('forbidden', 'Only the owner can transfer ownership');
    const target = await tx.members.find(eventId, memberId);
    if (!target || target.status !== 'active' || memberId === actor.memberId) {
      throw new ActionError('validation_failed', 'Choose another active member', {
        fields: [{ path: 'memberId', message: 'Choose another active member' }],
      });
    }
    await loadGrants(tx, eventId, [{ roleId: keepRoleId, subEventIds: [] }], 'keepRole');
    const owner = await reload(tx, eventId, actor.memberId);
    const ownerRoleId = await ownerRoleOf(tx, eventId, owner);
    if (!ownerRoleId) throw new Error(`Event ${eventId} has no Owner assignment`);

    const userId = userIdOf(ctx);
    await tx.members.replaceAssignments(
      eventId,
      memberId,
      [
        ...target.assignments.map(({ roleId, subEventIds }) => ({ roleId, subEventIds })),
        { roleId: ownerRoleId, subEventIds: [] },
      ],
      userId,
    );
    await tx.members.replaceAssignments(
      eventId,
      actor.memberId,
      [{ roleId: keepRoleId, subEventIds: [] }],
      userId,
    );
    await tx.events.setOwner(eventId, target.userId);
    await tx.access.bumpRolesVersion(eventId);
    const after = await reload(tx, eventId, memberId);
    return {
      result: after,
      activity: [
        {
          action: 'transfer_ownership',
          entityType: 'event',
          entityId: eventId,
          before: owner,
          after,
        },
      ],
    };
  },
};

async function ownerRoleOf(
  tx: CoreTx,
  eventId: string,
  member: Member,
): Promise<string | undefined> {
  for (const { roleId } of member.assignments) {
    if ((await tx.roles.find(eventId, roleId))?.isOwner) return roleId;
  }
  return undefined;
}
