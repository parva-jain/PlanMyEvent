import type { CreateRole, Role, UpdateRole } from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { versionMismatch } from '../events/versioned.js';
import { ActionError } from '../errors.js';
import type { CoreTx } from '../ports.js';
import { actorAccess, assertWithinOwn } from './access.js';

const nameTaken = () =>
  new ActionError('validation_failed', 'A role with this name already exists', {
    fields: [{ path: 'name', message: 'A role with this name already exists' }],
  });

/** Owner is the one role nobody edits or deletes (PRD rule 2). */
async function editableRole(tx: CoreTx, eventId: string, roleId: string): Promise<Role> {
  const role = await tx.roles.find(eventId, roleId);
  if (!role) throw new ActionError('not_found', 'Role not found');
  if (role.isOwner) throw new ActionError('forbidden', 'The Owner role cannot be changed');
  return role;
}

/** POST E/roles (roles.manage): a custom role within the creator's own permissions. */
export const createRole: ActionDefinition<CreateRole, Role, CoreTx> = {
  name: 'roles.create',
  permission: 'roles.manage',
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    assertWithinOwn(await actorAccess(tx, ctx), input.permissions);
    const inserted = await tx.roles.insert(eventId, [
      {
        name: input.name,
        description: input.description ?? null,
        isStandard: false,
        isOwner: false,
        permissions: input.permissions,
      },
    ]);
    if (inserted === 'name_taken') throw nameTaken();
    await tx.access.bumpRolesVersion(eventId);
    const role = inserted[0]!;
    return {
      result: role,
      activity: [
        { action: 'create', entityType: 'role', entityId: role.id, before: null, after: role },
      ],
    };
  },
};

/** PATCH E/roles/{roleId} (roles.manage, If-Match). Standard roles are editable; Owner isn't. */
export const updateRole: ActionDefinition<
  { roleId: string; expectedVersion: number; changes: UpdateRole },
  Role,
  CoreTx
> = {
  name: 'roles.update',
  permission: 'roles.manage',
  async execute(tx, ctx, { roleId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await editableRole(tx, eventId, roleId);
    if (changes.permissions) assertWithinOwn(await actorAccess(tx, ctx), changes.permissions);
    const after = await tx.roles.update(eventId, roleId, expectedVersion, changes);
    if (after === 'name_taken') throw nameTaken();
    if (!after) versionMismatch(await tx.roles.find(eventId, roleId), expectedVersion);
    await tx.access.bumpRolesVersion(eventId);
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'role', entityId: roleId, before, after }],
    };
  },
};

/** DELETE E/roles/{roleId} (roles.manage, If-Match): refused while anyone holds it. */
export const deleteRole: ActionDefinition<
  { roleId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'roles.delete',
  permission: 'roles.manage',
  async execute(tx, ctx, { roleId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await editableRole(tx, eventId, roleId);
    if (before.memberCount > 0) {
      throw new ActionError('role_in_use', 'Remove this role from its members first', {
        memberCount: before.memberCount,
      });
    }
    if (!(await tx.roles.softDelete(eventId, roleId, expectedVersion))) {
      versionMismatch(await tx.roles.find(eventId, roleId), expectedVersion);
    }
    await tx.access.bumpRolesVersion(eventId);
    return {
      result: undefined,
      activity: [{ action: 'delete', entityType: 'role', entityId: roleId, before, after: null }],
    };
  },
};
