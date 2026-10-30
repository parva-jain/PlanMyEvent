import {
  can,
  type Event,
  type EventModule,
  type Grant,
  type Member,
  type MemberInvite,
  type Role,
  type SubEvent,
  type Venue,
} from '@pme/contracts';

import type { ActionRuntime, OutboxMessage } from '../action.js';
import { ActionError } from '../errors.js';
import type { CoreTx, LockedMemberInvite, PersonalWorkspace, StoredActivity } from '../ports.js';
import { resolvePermissions } from '../team/access.js';

export interface MemoryMember {
  id: string;
  eventId: string;
  userId: string;
  status: Member['status'];
  joinedAt: string;
  version: number;
  assignments: Grant[];
}

/**
 * In-memory stores behaving like packages/db's (version guards, soft deletes, unique
 * slugs), so action tests run without Postgres. db's own tests cover the SQL.
 */
export function memoryRuntime() {
  let ids = 0;
  const nextId = () => `00000000-0000-7000-8000-${String(++ids).padStart(12, '0')}`;
  const profiles = new Map<string, { name?: string; phone?: string | null }>();
  const workspaces = new Map<string, PersonalWorkspace>();
  const events = new Map<string, Event & { deleted?: boolean }>();
  const modules = new Map<string, EventModule[]>();
  const venues = new Map<string, Venue & { eventId: string; deleted?: boolean }>();
  const subEvents = new Map<string, SubEvent & { eventId: string; deleted?: boolean }>();
  const roles = new Map<
    string,
    Omit<Role, 'memberCount'> & { eventId: string; deleted?: boolean }
  >();
  const members = new Map<string, MemoryMember>();
  const invites = new Map<string, LockedMemberInvite & { tokenHash: string; revokedAt?: string }>();
  const rolesVersion = new Map<string, number>();
  const owners = new Map<string, string>();
  const outbox: OutboxMessage[] = [];
  const activity: StoredActivity[] = [];
  const takenSlugs = new Set<string>();

  const memberCount = (roleId: string) =>
    [...members.values()].filter(
      (member) =>
        member.status === 'active' && member.assignments.some((item) => item.roleId === roleId),
    ).length;
  const toRole = (row: Omit<Role, 'memberCount'> & { eventId: string }): Role => ({
    ...strip({ ...row }),
    permissions: [...row.permissions],
    memberCount: memberCount(row.id),
  });
  const liveRole = (eventId: string, roleId: string) => {
    const role = roles.get(roleId);
    return role && role.eventId === eventId && !role.deleted ? role : undefined;
  };
  const nameTaken = (eventId: string, name: string, except?: string) =>
    [...roles.values()].some(
      (role) =>
        role.eventId === eventId &&
        !role.deleted &&
        role.id !== except &&
        role.name.toLowerCase() === name.toLowerCase(),
    );
  const toMember = (row: MemoryMember): Member => ({
    id: row.id,
    userId: row.userId,
    name: profiles.get(row.userId)?.name ?? `User ${row.userId}`,
    email: `${row.userId}@test.local`,
    avatarUrl: null,
    status: row.status,
    isOwner: row.assignments.some((item) => roles.get(item.roleId)?.isOwner),
    joinedAt: row.joinedAt,
    version: row.version,
    assignments: row.assignments.map((item) => ({
      roleId: item.roleId,
      roleName: roles.get(item.roleId)?.name ?? '',
      subEventIds: [...item.subEventIds],
    })),
  });

  const strip = <T extends object>(row: T & { eventId?: string; deleted?: boolean }): T => {
    const { eventId: _eventId, deleted: _deleted, ...rest } = row;
    return rest as T;
  };
  const liveEvent = (id: string) => {
    const event = events.get(id);
    return event && !event.deleted ? event : undefined;
  };
  const liveIn = <T extends { eventId: string; deleted?: boolean }>(
    map: Map<string, T>,
    eventId: string,
    id: string,
  ) => {
    const row = map.get(id);
    return row && row.eventId === eventId && !row.deleted ? row : undefined;
  };

  // Team stores are attached below, once the helpers they share are defined.
  const base: Omit<CoreTx, 'roles' | 'members' | 'access' | 'memberInvites' | 'activity'> = {
    users: {
      updateProfile: (userId, changes) => {
        const profile = profiles.get(userId);
        if (profile) Object.assign(profile, changes);
        return Promise.resolve(Boolean(profile));
      },
    },
    workspaces: {
      findPersonal: (owner) => Promise.resolve(workspaces.get(owner) ?? null),
      createPersonal: ({ ownerUserId, name }) => {
        const existing = workspaces.get(ownerUserId);
        if (existing) return Promise.resolve({ workspace: existing, created: false });
        const workspace = { id: nextId(), name, plan: 'free' as const };
        workspaces.set(ownerUserId, workspace);
        return Promise.resolve({ workspace, created: true });
      },
    },
    events: {
      insert: (input) => {
        if (takenSlugs.has(input.slug)) return Promise.resolve('slug_taken' as const);
        takenSlugs.add(input.slug);
        const event: Event = {
          id: nextId(),
          slug: input.slug,
          name: input.name,
          type: input.type,
          description: null,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          timeZone: input.timeZone,
          status: input.status,
          guestScope: 'whole_event',
          responseMode: input.responseMode,
          budgetPaise: null,
          version: 1,
          createdAt: new Date().toISOString(),
        };
        events.set(event.id, event);
        return Promise.resolve({ ...event });
      },
      find: (id) => Promise.resolve(liveEvent(id) ? strip({ ...liveEvent(id)! }) : null),
      update: (id, expected, changes) => {
        const event = liveEvent(id);
        if (!event || event.version !== expected) return Promise.resolve(null);
        Object.assign(event, changes, { version: event.version + 1 });
        return Promise.resolve(strip({ ...event }));
      },
      listModules: (id) => Promise.resolve([...(modules.get(id) ?? [])]),
      replaceModules: (id, list) => {
        modules.set(
          id,
          list.map((item) => ({ ...item })),
        );
        return Promise.resolve();
      },
      setOwner: (id, userId) => {
        owners.set(id, userId);
        return Promise.resolve();
      },
    },
    venues: {
      insert: (eventId, input) => {
        const venue = {
          id: nextId(),
          eventId,
          name: input.name,
          address: input.address ?? null,
          mapUrl: input.mapUrl ?? null,
        };
        venues.set(venue.id, venue);
        return Promise.resolve(strip({ ...venue }));
      },
      find: (eventId, id) => {
        const venue = liveIn(venues, eventId, id);
        return Promise.resolve(venue ? strip({ ...venue }) : null);
      },
      update: (eventId, id, changes) => {
        const venue = liveIn(venues, eventId, id);
        if (venue) Object.assign(venue, changes);
        return Promise.resolve(venue ? strip({ ...venue }) : null);
      },
      softDelete: (eventId, id) => {
        const venue = liveIn(venues, eventId, id);
        if (!venue) return Promise.resolve(false);
        venue.deleted = true;
        for (const subEvent of subEvents.values()) {
          if (subEvent.venueId === id)
            Object.assign(subEvent, { venueId: null, version: subEvent.version + 1 });
        }
        return Promise.resolve(true);
      },
      restore: (eventId, id) => {
        const venue = venues.get(id);
        if (!venue || venue.eventId !== eventId || !venue.deleted) return Promise.resolve(null);
        venue.deleted = false;
        return Promise.resolve(strip({ ...venue }));
      },
    },
    subEvents: {
      insert: (eventId, list) => {
        const created = list.map((input) => {
          const subEvent = {
            id: nextId(),
            eventId,
            name: input.name,
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
            venueId: input.venueId ?? null,
            capacity: input.capacity ?? null,
            visibility: input.visibility ?? 'invite_only',
            responseMode: input.responseMode ?? null,
            groupLabel: input.groupLabel ?? null,
            notes: input.notes ?? null,
            position: input.position ?? 0,
            version: 1,
          } satisfies SubEvent & { eventId: string };
          subEvents.set(subEvent.id, subEvent);
          return strip({ ...subEvent });
        });
        return Promise.resolve(created);
      },
      find: (eventId, id) => {
        const subEvent = liveIn(subEvents, eventId, id);
        return Promise.resolve(subEvent ? strip({ ...subEvent }) : null);
      },
      update: (eventId, id, expected, changes) => {
        const subEvent = liveIn(subEvents, eventId, id);
        if (!subEvent || subEvent.version !== expected) return Promise.resolve(null);
        Object.assign(subEvent, changes, { version: subEvent.version + 1 });
        return Promise.resolve(strip({ ...subEvent }));
      },
      softDelete: (eventId, id, expected) => {
        const subEvent = liveIn(subEvents, eventId, id);
        if (!subEvent || subEvent.version !== expected) return Promise.resolve(false);
        Object.assign(subEvent, { deleted: true, version: subEvent.version + 1 });
        return Promise.resolve(true);
      },
      restore: (eventId, id) => {
        const subEvent = subEvents.get(id);
        if (!subEvent || subEvent.eventId !== eventId || !subEvent.deleted) {
          return Promise.resolve(null);
        }
        Object.assign(subEvent, { deleted: false, version: subEvent.version + 1 });
        return Promise.resolve(strip({ ...subEvent }));
      },
    },
  };
  const tx = base as CoreTx;

  tx.activity = {
    insert: (rows) => {
      const stored = rows.map((row) => ({
        ...row,
        id: nextId(),
        createdAt: new Date(Date.now() + activity.length).toISOString(),
        undoneAt: null,
      }));
      activity.push(...stored);
      return Promise.resolve(stored.map((row) => ({ ...row })));
    },
    lockForUndo: (eventId, id) => {
      const row = activity.find((item) => item.id === id && item.eventId === eventId);
      return Promise.resolve(row ? { ...row } : null);
    },
    markUndone: (eventId, id) => {
      const row = activity.find((item) => item.id === id && item.eventId === eventId);
      if (!row || row.undoneAt) return Promise.resolve(false);
      row.undoneAt = new Date().toISOString();
      return Promise.resolve(true);
    },
  };

  tx.roles = {
    insert: (eventId, list) => {
      if (list.some((role) => nameTaken(eventId, role.name))) {
        return Promise.resolve('name_taken' as const);
      }
      return Promise.resolve(
        list.map((input) => {
          const role = {
            id: nextId(),
            eventId,
            name: input.name,
            description: input.description ?? null,
            isStandard: input.isStandard,
            isOwner: input.isOwner,
            permissions: [...input.permissions],
            version: 1,
          };
          roles.set(role.id, role);
          return toRole(role);
        }),
      );
    },
    find: (eventId, roleId) => {
      const role = liveRole(eventId, roleId);
      return Promise.resolve(role ? toRole(role) : null);
    },
    update: (eventId, roleId, expected, changes) => {
      const role = liveRole(eventId, roleId);
      if (!role || role.version !== expected) return Promise.resolve(null);
      if (changes.name && nameTaken(eventId, changes.name, roleId)) {
        return Promise.resolve('name_taken' as const);
      }
      Object.assign(role, changes, {
        permissions: [...(changes.permissions ?? role.permissions)],
        version: role.version + 1,
      });
      return Promise.resolve(toRole(role));
    },
    softDelete: (eventId, roleId, expected) => {
      const role = liveRole(eventId, roleId);
      if (!role || role.version !== expected) return Promise.resolve(false);
      role.deleted = true;
      return Promise.resolve(true);
    },
  };

  const memberIn = (eventId: string, memberId: string) => {
    const member = members.get(memberId);
    return member?.eventId === eventId ? member : undefined;
  };
  tx.members = {
    find: (eventId, memberId) => {
      const member = memberIn(eventId, memberId);
      return Promise.resolve(member ? toMember(member) : null);
    },
    findByUser: (eventId, userId) => {
      const member = [...members.values()].find(
        (row) => row.eventId === eventId && row.userId === userId,
      );
      return Promise.resolve(member ? toMember(member) : null);
    },
    join: (eventId, userId) => {
      let member = [...members.values()].find(
        (row) => row.eventId === eventId && row.userId === userId,
      );
      if (member) {
        Object.assign(member, { status: 'active', version: member.version + 1 });
      } else {
        member = {
          id: nextId(),
          eventId,
          userId,
          status: 'active',
          joinedAt: new Date().toISOString(),
          version: 1,
          assignments: [],
        };
        members.set(member.id, member);
      }
      return Promise.resolve(toMember(member));
    },
    replaceAssignments: (eventId, memberId, grants, _grantedBy, expected) => {
      const member = memberIn(eventId, memberId);
      if (!member || (expected !== undefined && member.version !== expected)) {
        return Promise.resolve(false);
      }
      member.assignments = grants.map((grant) => ({
        ...grant,
        subEventIds: [...grant.subEventIds],
      }));
      member.version += 1;
      return Promise.resolve(true);
    },
    remove: (eventId, memberId, expected) => {
      const member = memberIn(eventId, memberId);
      if (!member || (expected !== undefined && member.version !== expected)) {
        return Promise.resolve(false);
      }
      Object.assign(member, { status: 'removed', assignments: [], version: member.version + 1 });
      return Promise.resolve(true);
    },
  };

  tx.access = {
    forUser: (eventId, userId) => {
      const member = [...members.values()].find(
        (row) => row.eventId === eventId && row.userId === userId && row.status === 'active',
      );
      if (!member || !liveEvent(eventId)) return Promise.resolve(null);
      const live = member.assignments.filter((item) => liveRole(eventId, item.roleId));
      const rows = live.flatMap((item) =>
        (item.subEventIds.length ? item.subEventIds : [null]).map((subEventId) => ({
          subEventId,
          permissions: roles.get(item.roleId)!.permissions,
        })),
      );
      return Promise.resolve({
        ...resolvePermissions(rows),
        memberId: member.id,
        isOwner: live.some((item) => roles.get(item.roleId)!.isOwner),
      });
    },
    bumpRolesVersion: (eventId) => {
      rolesVersion.set(eventId, (rolesVersion.get(eventId) ?? 1) + 1);
      return Promise.resolve();
    },
    removeSubEventScopes: (eventId, subEventId) => {
      let changed = false;
      for (const member of members.values()) {
        if (member.eventId !== eventId) continue;
        member.assignments = member.assignments.flatMap((item) => {
          if (!item.subEventIds.includes(subEventId)) return [item];
          changed = true;
          const rest = item.subEventIds.filter((id) => id !== subEventId);
          return rest.length ? [{ ...item, subEventIds: rest }] : [];
        });
      }
      return Promise.resolve(changed);
    },
  };

  const publicInvite = (row: LockedMemberInvite): MemberInvite => ({
    id: row.id,
    email: row.email,
    grants: row.grants,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  });
  tx.memberInvites = {
    insert: (eventId, input) => {
      const invite = {
        id: nextId(),
        eventId,
        tokenHash: input.tokenHash.toString('hex'),
        email: input.email,
        grants: input.grants,
        maxUses: input.maxUses,
        usedCount: 0,
        expiresAt: input.expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: { name: profiles.get(input.createdByUserId)?.name ?? 'Someone' },
        createdByUserId: input.createdByUserId,
        revoked: false,
      };
      invites.set(invite.id, invite);
      return Promise.resolve(publicInvite(invite));
    },
    lockByTokenHash: (hash) => {
      const invite = [...invites.values()].find((row) => row.tokenHash === hash.toString('hex'));
      return Promise.resolve(invite ? { ...publicInvite(invite), ...pick(invite) } : null);
    },
    recordUse: (inviteId) => {
      invites.get(inviteId)!.usedCount += 1;
      return Promise.resolve();
    },
    revoke: (eventId, inviteId) => {
      const invite = invites.get(inviteId);
      if (!invite || invite.eventId !== eventId || invite.revoked) return Promise.resolve(false);
      invite.revoked = true;
      return Promise.resolve(true);
    },
  };
  const pick = ({ eventId, createdByUserId, revoked }: LockedMemberInvite) => ({
    eventId,
    createdByUserId,
    revoked,
  });

  const runtime: ActionRuntime<CoreTx> = {
    transaction: (fn) => fn(tx),
    // Mirrors packages/db's check: 404 for non-members, 403 naming the missing permission.
    checkPermission: async (_tx, ctx, permission, subEventId) => {
      const access =
        ctx.eventId && ctx.actor.kind === 'user'
          ? await tx.access.forUser(ctx.eventId, ctx.actor.userId)
          : null;
      if (!access) throw new ActionError('not_found', 'Event not found');
      if (!can(access, permission, subEventId)) {
        throw new ActionError('forbidden', `You need ${permission}`, { permission });
      }
    },
    // Mirrors packages/db: `<entityType>.<verb>`, the actor's name as the label.
    recordActivity: async (_tx, ctx, entries) => {
      const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
      await tx.activity.insert(
        entries.map((entry) => ({
          eventId: entry.eventId ?? ctx.eventId!,
          actorUserId: userId,
          actorLabel: (userId && profiles.get(userId)?.name) || 'Someone',
          channel: ctx.channel,
          action: `${entry.entityType}.${entry.action}`,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before,
          after: entry.after,
          requestId: ctx.requestId,
          undoOfId: entry.undoOfId ?? null,
        })),
      );
    },
    writeOutbox: (_tx, _ctx, messages) => {
      outbox.push(...messages);
      return Promise.resolve();
    },
  };

  return {
    runtime,
    tx,
    roles,
    members,
    invites,
    rolesVersion,
    owners,
    profiles,
    workspaces,
    events,
    venues,
    subEvents,
    modules,
    outbox,
    activity,
    takenSlugs,
  };
}
