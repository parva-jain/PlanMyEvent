import {
  can,
  isPermission,
  type EffectivePermissions,
  type Grant,
  type Permission,
  type Role,
} from '@pme/contracts';

import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import type { CoreTx, MemberAccess } from '../ports.js';

/** One row of DatabaseDesign's effective-permissions query: null sub-event = whole event. */
export interface GrantRow {
  subEventId: string | null;
  permissions: readonly string[];
}

/**
 * Unions grant rows per scope (PRD rule 4). Sub-event sets leave out what the whole event
 * already grants, and unknown strings (a permission renamed before its migration ran) are
 * dropped rather than trusted.
 */
export function resolvePermissions(rows: readonly GrantRow[]): EffectivePermissions {
  const whole = new Set<Permission>();
  const scoped = new Map<string, Set<Permission>>();
  for (const row of rows) {
    const target = row.subEventId
      ? (scoped.get(row.subEventId) ?? scoped.set(row.subEventId, new Set()).get(row.subEventId)!)
      : whole;
    for (const permission of row.permissions) {
      if (isPermission(permission)) target.add(permission);
    }
  }
  const subEvents: Record<string, Permission[]> = {};
  for (const [subEventId, set] of scoped) {
    const extra = [...set].filter((permission) => !whole.has(permission)).sort();
    if (extra.length) subEvents[subEventId] = extra;
  }
  return { wholeEvent: [...whole].sort(), subEvents };
}

export function userIdOf(ctx: ActionContext): string {
  if (ctx.actor.kind !== 'user') {
    throw new ActionError('forbidden', 'Only a signed-in user can do this');
  }
  return ctx.actor.userId;
}

/** The acting user's membership and permissions; non-members see the event as missing. */
export async function actorAccess(tx: CoreTx, ctx: ActionContext): Promise<MemberAccess> {
  const access = await tx.access.forUser(ctx.eventId!, userIdOf(ctx));
  if (!access) throw new ActionError('not_found', 'Event not found');
  return access;
}

/** The permission check runAction does, for a check that depends on what's loaded inside. */
export async function requirePermission(
  tx: CoreTx,
  ctx: ActionContext,
  permission: Permission,
  subEventId: string | null = null,
): Promise<MemberAccess> {
  const access = await actorAccess(tx, ctx);
  if (!can(access, permission, subEventId)) {
    throw new ActionError('forbidden', `You need the ${permission} permission`, { permission });
  }
  return access;
}

const beyondOwn = (missing: Permission[]) =>
  new ActionError('forbidden', 'You can only grant permissions you have yourself', {
    permissions: missing,
  });

/**
 * PRD rule 3: nobody grants beyond their own. A whole-event grant must be within the actor's
 * whole-event permissions; a scoped one within what the actor has in each of its sub-events.
 */
export function assertWithinOwn(
  actor: EffectivePermissions,
  permissions: readonly Permission[],
  subEventIds: readonly string[] = [],
): void {
  const scopes = subEventIds.length ? subEventIds : [null];
  const missing = permissions.filter((permission) =>
    scopes.some((subEventId) => !can(actor, permission, subEventId)),
  );
  if (missing.length) throw beyondOwn([...new Set(missing)]);
}

/**
 * Changing or removing someone needs at least their permissions, so a narrow role holding
 * members.manage can't strip an Admin.
 */
export function assertCovers(actor: EffectivePermissions, target: EffectivePermissions): void {
  assertWithinOwn(actor, target.wholeEvent);
  for (const [subEventId, permissions] of Object.entries(target.subEvents)) {
    assertWithinOwn(actor, permissions, [subEventId]);
  }
}

/**
 * Checks each grant's role and sub-events exist in this event. The Owner role is only ever
 * held through creating the event or a transfer (PRD rule 2).
 */
export async function loadGrants(
  tx: CoreTx,
  eventId: string,
  grants: readonly Grant[],
  path = 'grants',
): Promise<{ grant: Grant; role: Role }[]> {
  const loaded: { grant: Grant; role: Role }[] = [];
  for (const [index, grant] of grants.entries()) {
    const role = await tx.roles.find(eventId, grant.roleId);
    const field = (message: string, suffix = 'roleId') =>
      new ActionError('validation_failed', message, {
        fields: [{ path: `${path}.${index}.${suffix}`, message }],
      });
    if (!role) throw field('Role not found in this event');
    if (role.isOwner) throw field('The Owner role changes hands only through a transfer');
    for (const subEventId of grant.subEventIds) {
      if (!(await tx.subEvents.find(eventId, subEventId))) {
        throw field('Sub-event not found in this event', 'subEventIds');
      }
    }
    loaded.push({ grant, role });
  }
  return loaded;
}

/** loadGrants plus the actor's own-permissions check for each grant. */
export async function checkGrants(
  tx: CoreTx,
  eventId: string,
  actor: EffectivePermissions,
  grants: readonly Grant[],
  path?: string,
): Promise<void> {
  for (const { grant, role } of await loadGrants(tx, eventId, grants, path)) {
    assertWithinOwn(actor, role.permissions, grant.subEventIds);
  }
}

/** A member's effective permissions from their assignments and the roles behind them. */
export async function memberPermissions(
  tx: CoreTx,
  eventId: string,
  assignments: readonly { roleId: string; subEventIds: string[] }[],
): Promise<EffectivePermissions> {
  const rows: GrantRow[] = [];
  for (const assignment of assignments) {
    const role = await tx.roles.find(eventId, assignment.roleId);
    if (!role) continue;
    const scopes = assignment.subEventIds.length ? assignment.subEventIds : [null];
    for (const subEventId of scopes) rows.push({ subEventId, permissions: role.permissions });
  }
  return resolvePermissions(rows);
}
