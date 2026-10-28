import type { Grant, Member, MemberInvite, Permission, Role } from '@pme/contracts';
import {
  resolvePermissions,
  type AccessStore,
  type LockedMemberInvite,
  type MemberInviteStore,
  type MemberStore,
  type RoleStore,
} from '@pme/core';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { users } from '../schema/auth.js';
import { events } from '../schema/events.js';
import {
  memberInvites,
  members,
  roleAssignments,
  roleAssignmentScopes,
  roles,
} from '../schema/team.js';
import { isUniqueViolation } from './events.js';

type Queryable = Database | DrizzleTx;

// ---- Roles ----------------------------------------------------------------------------------

/**
 * Active members holding the role (removed members have no assignments left). Qualified by
 * hand: Drizzle leaves single-table columns unqualified, which is ambiguous in a subquery.
 */
const memberCount = sql<number>`(
  select count(*)::int from ${roleAssignments} ra
  join ${members} m on m.id = ra.member_id and m.status = 'active'
  where ra.role_id = "roles"."id"
)`;

const roleColumns = {
  id: roles.id,
  name: roles.name,
  description: roles.description,
  isStandard: roles.isStandard,
  isOwner: roles.isOwner,
  permissions: roles.permissions,
  version: roles.version,
  memberCount,
};

const toRole = (row: { permissions: string[] } & Omit<Role, 'permissions'>): Role => ({
  ...row,
  permissions: row.permissions as Permission[],
});

const liveRole = (eventId: string, roleId: string) =>
  and(eq(roles.eventId, eventId), eq(roles.id, roleId), isNull(roles.deletedAt));

export function listRoles(db: Queryable, eventId: string): Promise<Role[]> {
  return db
    .select(roleColumns)
    .from(roles)
    .where(and(eq(roles.eventId, eventId), isNull(roles.deletedAt)))
    .orderBy(asc(roles.createdAt), asc(roles.id))
    .then((rows) => rows.map(toRole));
}

export function roleStore(db: Queryable): RoleStore {
  const find = async (eventId: string, roleId: string) => {
    const [row] = await db.select(roleColumns).from(roles).where(liveRole(eventId, roleId));
    return row ? toRole(row) : null;
  };
  return {
    async insert(eventId, list) {
      try {
        // A savepoint, so a duplicate name doesn't abort the action's transaction.
        const rows = await db.transaction((savepoint) =>
          savepoint
            .insert(roles)
            .values(
              list.map((role) => ({
                eventId,
                name: role.name,
                description: role.description ?? null,
                isStandard: role.isStandard,
                isOwner: role.isOwner,
                permissions: [...role.permissions],
              })),
            )
            .returning({ id: roles.id }),
        );
        return Promise.all(rows.map((row) => find(eventId, row.id).then((role) => role!)));
      } catch (error) {
        if (isUniqueViolation(error)) return 'name_taken';
        throw error;
      }
    },
    find,
    async update(eventId, roleId, expectedVersion, changes) {
      try {
        const rows = await db.transaction((savepoint) =>
          savepoint
            .update(roles)
            .set({
              name: changes.name,
              description: changes.description,
              permissions: changes.permissions ? [...changes.permissions] : undefined,
              version: sql`${roles.version} + 1`,
            })
            .where(and(liveRole(eventId, roleId), eq(roles.version, expectedVersion)))
            .returning({ id: roles.id }),
        );
        return rows.length ? find(eventId, roleId) : null;
      } catch (error) {
        if (isUniqueViolation(error)) return 'name_taken';
        throw error;
      }
    },
    async softDelete(eventId, roleId, expectedVersion) {
      const rows = await db
        .update(roles)
        .set({ deletedAt: sql`now()`, version: sql`${roles.version} + 1` })
        .where(and(liveRole(eventId, roleId), eq(roles.version, expectedVersion)))
        .returning({ id: roles.id });
      return rows.length > 0;
    },
  };
}

// ---- Members ----------------------------------------------------------------------------------

/** Members of one event with their user and assignments; `filter` narrows the member rows. */
export async function loadMembers(db: Queryable, eventId: string, filter?: SQL): Promise<Member[]> {
  const rows = await db
    .select({
      id: members.id,
      userId: members.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      status: members.status,
      joinedAt: members.joinedAt,
      version: members.version,
    })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .where(and(eq(members.eventId, eventId), filter))
    .orderBy(asc(members.joinedAt), asc(members.id));
  if (!rows.length) return [];

  const assignments = await db
    .select({
      memberId: roleAssignments.memberId,
      roleId: roleAssignments.roleId,
      roleName: roles.name,
      isOwner: roles.isOwner,
      subEventIds: sql<string[]>`coalesce(
        array_agg(${roleAssignmentScopes.subEventId}::text order by ${roleAssignmentScopes.subEventId})
          filter (where ${roleAssignmentScopes.subEventId} is not null),
        '{}'::text[])`,
    })
    .from(roleAssignments)
    .innerJoin(roles, and(eq(roles.id, roleAssignments.roleId), isNull(roles.deletedAt)))
    .leftJoin(roleAssignmentScopes, eq(roleAssignmentScopes.roleAssignmentId, roleAssignments.id))
    .where(
      and(
        eq(roleAssignments.eventId, eventId),
        inArray(
          roleAssignments.memberId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .groupBy(roleAssignments.id, roles.id)
    .orderBy(asc(roles.createdAt), asc(roles.id));

  return rows.map((row) => {
    const own = assignments.filter((item) => item.memberId === row.id);
    return {
      ...row,
      status: row.status as Member['status'],
      joinedAt: row.joinedAt.toISOString(),
      isOwner: own.some((item) => item.isOwner),
      assignments: own.map(({ roleId, roleName, subEventIds }) => ({
        roleId,
        roleName,
        subEventIds,
      })),
    };
  });
}

export function memberStore(db: Queryable): MemberStore {
  const one = async (eventId: string, filter: SQL) =>
    (await loadMembers(db, eventId, filter))[0] ?? null;
  const guard = (eventId: string, memberId: string, expectedVersion?: number) =>
    and(
      eq(members.eventId, eventId),
      eq(members.id, memberId),
      expectedVersion === undefined ? undefined : eq(members.version, expectedVersion),
    );

  return {
    find: (eventId, memberId) => one(eventId, eq(members.id, memberId)),
    findByUser: (eventId, userId) => one(eventId, eq(members.userId, userId)),
    async join(eventId, userId, invitedByUserId) {
      // A removed member coming back keeps their id, so their history stays theirs.
      const [row] = await db
        .insert(members)
        .values({ eventId, userId, invitedByUserId })
        .onConflictDoUpdate({
          target: [members.eventId, members.userId],
          set: {
            status: 'active',
            removedAt: null,
            invitedByUserId,
            joinedAt: sql`now()`,
            version: sql`${members.version} + 1`,
          },
        })
        .returning({ id: members.id });
      return (await one(eventId, eq(members.id, row!.id)))!;
    },
    async replaceAssignments(eventId, memberId, grants, grantedByUserId, expectedVersion) {
      const bumped = await db
        .update(members)
        .set({ version: sql`${members.version} + 1` })
        .where(and(guard(eventId, memberId, expectedVersion), eq(members.status, 'active')))
        .returning({ id: members.id });
      if (!bumped.length) return false;
      await db
        .delete(roleAssignments)
        .where(and(eq(roleAssignments.eventId, eventId), eq(roleAssignments.memberId, memberId)));
      await insertAssignments(db, eventId, memberId, grants, grantedByUserId);
      return true;
    },
    async remove(eventId, memberId, expectedVersion) {
      const removed = await db
        .update(members)
        .set({ status: 'removed', removedAt: sql`now()`, version: sql`${members.version} + 1` })
        .where(and(guard(eventId, memberId, expectedVersion), eq(members.status, 'active')))
        .returning({ id: members.id });
      if (!removed.length) return false;
      await db
        .delete(roleAssignments)
        .where(and(eq(roleAssignments.eventId, eventId), eq(roleAssignments.memberId, memberId)));
      return true;
    },
  };
}

async function insertAssignments(
  db: Queryable,
  eventId: string,
  memberId: string,
  grants: readonly Grant[],
  grantedByUserId: string,
) {
  if (!grants.length) return;
  const inserted = await db
    .insert(roleAssignments)
    .values(grants.map((grant) => ({ eventId, memberId, roleId: grant.roleId, grantedByUserId })))
    .returning({ id: roleAssignments.id, roleId: roleAssignments.roleId });
  const scopes = inserted.flatMap((row) =>
    grants
      .find((grant) => grant.roleId === row.roleId)!
      .subEventIds.map((subEventId) => ({ roleAssignmentId: row.id, eventId, subEventId })),
  );
  if (scopes.length) await db.insert(roleAssignmentScopes).values(scopes);
}

// ---- Access ---------------------------------------------------------------------------------

/**
 * One member's grant rows (DatabaseDesign "Effective permissions"): whole-event rows have no
 * sub-event; deleted roles and soft-deleted sub-events don't count.
 */
export async function loadAccess(db: Queryable, eventId: string, userId: string) {
  const result = await db.execute<{
    member_id: string;
    sub_event_id: string | null;
    permissions: string[];
    is_owner: boolean;
  }>(sql`
    select m.id as member_id, ras.sub_event_id, r.permissions, r.is_owner
    from ${members} m
    join ${events} e on e.id = m.event_id and e.deleted_at is null
    left join ${roleAssignments} ra on ra.member_id = m.id
    left join ${roles} r on r.id = ra.role_id and r.deleted_at is null
    left join ${roleAssignmentScopes} ras on ras.role_assignment_id = ra.id
    where m.event_id = ${eventId} and m.user_id = ${userId} and m.status = 'active'
  `);
  const rows = result.rows;
  if (!rows.length) return null;
  const grants = rows
    .filter((row) => row.permissions)
    .map((row) => ({ subEventId: row.sub_event_id, permissions: row.permissions }));
  return {
    ...resolvePermissions(grants),
    memberId: rows[0]!.member_id,
    isOwner: rows.some((row) => row.is_owner),
  };
}

export function accessStore(db: Queryable): AccessStore {
  return {
    forUser: (eventId, userId) => loadAccess(db, eventId, userId),
    async bumpRolesVersion(eventId) {
      await db
        .update(events)
        .set({ rolesVersion: sql`${events.rolesVersion} + 1` })
        .where(eq(events.id, eventId));
    },
    async removeSubEventScopes(eventId, subEventId) {
      const removed = await db
        .delete(roleAssignmentScopes)
        .where(
          and(
            eq(roleAssignmentScopes.eventId, eventId),
            eq(roleAssignmentScopes.subEventId, subEventId),
          ),
        )
        .returning({ id: roleAssignmentScopes.roleAssignmentId });
      if (!removed.length) return false;
      // Assignments that were scoped and now have no scope would widen to the whole event.
      await db.delete(roleAssignments).where(
        and(
          inArray(
            roleAssignments.id,
            removed.map((row) => row.id),
          ),
          sql`not exists (select 1 from ${roleAssignmentScopes} s where s.role_assignment_id = ${roleAssignments.id})`,
        ),
      );
      return true;
    },
  };
}

// ---- Member invites ---------------------------------------------------------------------------

const inviteColumns = {
  id: memberInvites.id,
  eventId: memberInvites.eventId,
  email: memberInvites.email,
  grants: memberInvites.grants,
  maxUses: memberInvites.maxUses,
  usedCount: memberInvites.usedCount,
  expiresAt: memberInvites.expiresAt,
  createdAt: memberInvites.createdAt,
  revokedAt: memberInvites.revokedAt,
  createdByUserId: memberInvites.createdByUserId,
  createdByName: users.name,
};

interface InviteRow {
  id: string;
  eventId: string;
  email: string | null;
  grants: unknown;
  maxUses: number;
  usedCount: number;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  createdByUserId: string;
  createdByName: string;
}

export function toLockedInvite(row: InviteRow): LockedMemberInvite {
  return {
    id: row.id,
    eventId: row.eventId,
    email: row.email,
    grants: row.grants as Grant[],
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdBy: { name: row.createdByName },
    createdByUserId: row.createdByUserId,
    revoked: row.revokedAt !== null,
  };
}

export const toInvite = (row: InviteRow): MemberInvite => {
  const { eventId: _e, createdByUserId: _c, revoked: _r, ...invite } = toLockedInvite(row);
  return invite;
};

export const selectInvites = (db: Queryable) =>
  db
    .select(inviteColumns)
    .from(memberInvites)
    .innerJoin(users, eq(users.id, memberInvites.createdByUserId));

export function memberInviteStore(db: Queryable): MemberInviteStore {
  return {
    async insert(eventId, invite) {
      const [row] = await db
        .insert(memberInvites)
        .values({ eventId, ...invite })
        .returning({ id: memberInvites.id });
      const [created] = await selectInvites(db).where(eq(memberInvites.id, row!.id));
      return toInvite(created!);
    },
    async lockByTokenHash(tokenHash) {
      const [row] = await selectInvites(db)
        .where(eq(memberInvites.tokenHash, tokenHash))
        .for('update', { of: memberInvites });
      return row ? toLockedInvite(row) : null;
    },
    async recordUse(inviteId) {
      await db
        .update(memberInvites)
        .set({ usedCount: sql`${memberInvites.usedCount} + 1` })
        .where(eq(memberInvites.id, inviteId));
    },
    async revoke(eventId, inviteId) {
      const rows = await db
        .update(memberInvites)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(memberInvites.eventId, eventId),
            eq(memberInvites.id, inviteId),
            isNull(memberInvites.revokedAt),
          ),
        )
        .returning({ id: memberInvites.id });
      return rows.length > 0;
    },
  };
}
