import type {
  EffectivePermissions,
  Event,
  EventModule,
  Grant,
  Member,
  MemberInvite,
  Permission,
  Role,
  SubEvent,
  UpdateEvent,
  UpdateSubEvent,
  UpdateVenue,
  ValueOf,
  Venue,
} from '@pme/contracts';

/*
 * What actions need from storage, as interfaces core owns (ports). packages/db implements
 * them with Drizzle inside the action's transaction; tests use fakes. This keeps core free
 * of Drizzle and NestJS (CLAUDE.md, packages/core). Grows milestone by milestone.
 */

export interface PersonalWorkspace {
  id: string;
  name: string;
  plan: ValueOf<'plan'>;
}

export interface WorkspaceStore {
  findPersonal(ownerUserId: string): Promise<PersonalWorkspace | null>;
  /**
   * Inserts the user's personal workspace unless one exists (the unique index makes this
   * safe under concurrency) and returns it either way.
   */
  createPersonal(input: {
    ownerUserId: string;
    name: string;
  }): Promise<{ workspace: PersonalWorkspace; created: boolean }>;
}

export interface UserStore {
  /** Changes only the given fields; returns false if the user doesn't exist. */
  updateProfile(
    userId: string,
    changes: { name?: string; phone?: string | null },
  ): Promise<boolean>;
}

export interface NewEvent {
  workspaceId: string;
  ownerUserId: string;
  type: Event['type'];
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  timeZone: string;
  status: Event['status'];
  responseMode: Event['responseMode'];
}

/** Event rows. `find` and `update` skip soft-deleted events. */
export interface EventStore {
  /** 'slug_taken' when the slug's unique index rejects it. */
  insert(event: NewEvent): Promise<Event | 'slug_taken'>;
  find(eventId: string): Promise<Event | null>;
  /** Applies the changes and bumps the version, only if the version still matches. */
  update(eventId: string, expectedVersion: number, changes: UpdateEvent): Promise<Event | null>;
  listModules(eventId: string): Promise<EventModule[]>;
  replaceModules(eventId: string, modules: EventModule[]): Promise<void>;
  /** events.owner_user_id follows the Owner role assignment (transfer ownership). */
  setOwner(eventId: string, userId: string): Promise<void>;
}

export interface NewVenue {
  name: string;
  address?: string | null;
  mapUrl?: string | null;
}

export interface VenueStore {
  insert(eventId: string, venue: NewVenue): Promise<Venue>;
  find(eventId: string, venueId: string): Promise<Venue | null>;
  update(eventId: string, venueId: string, changes: UpdateVenue): Promise<Venue | null>;
  /** Soft-deletes the venue and clears it from sub-events (bumping their versions). */
  softDelete(eventId: string, venueId: string): Promise<boolean>;
}

export interface NewSubEvent {
  name: string;
  startsAt: Date;
  endsAt: Date;
  venueId?: string | null;
  capacity?: number | null;
  visibility?: SubEvent['visibility'];
  responseMode?: SubEvent['responseMode'];
  groupLabel?: string | null;
  notes?: string | null;
  position?: number;
}

export interface SubEventStore {
  insert(eventId: string, subEvents: NewSubEvent[]): Promise<SubEvent[]>;
  find(eventId: string, subEventId: string): Promise<SubEvent | null>;
  update(
    eventId: string,
    subEventId: string,
    expectedVersion: number,
    changes: UpdateSubEvent,
  ): Promise<SubEvent | null>;
  softDelete(eventId: string, subEventId: string, expectedVersion: number): Promise<boolean>;
}

export interface NewRole {
  name: string;
  description?: string | null;
  isStandard: boolean;
  isOwner: boolean;
  permissions: readonly Permission[];
}

export interface RoleChanges {
  name?: string;
  description?: string | null;
  permissions?: readonly Permission[];
}

/** Roles skip soft-deleted rows. Names are unique per event, ignoring case. */
export interface RoleStore {
  insert(eventId: string, roles: NewRole[]): Promise<Role[] | 'name_taken'>;
  find(eventId: string, roleId: string): Promise<Role | null>;
  update(
    eventId: string,
    roleId: string,
    expectedVersion: number,
    changes: RoleChanges,
  ): Promise<Role | null | 'name_taken'>;
  softDelete(eventId: string, roleId: string, expectedVersion: number): Promise<boolean>;
}

/** Members in any status; `assignments` is empty for removed members. */
export interface MemberStore {
  find(eventId: string, memberId: string): Promise<Member | null>;
  findByUser(eventId: string, userId: string): Promise<Member | null>;
  /** A new active member, or a removed one made active again. */
  join(eventId: string, userId: string, invitedByUserId: string | null): Promise<Member>;
  /**
   * Replaces every role assignment and scope and bumps the member's version, only if the
   * version still matches (when given). False on a mismatch.
   */
  replaceAssignments(
    eventId: string,
    memberId: string,
    grants: Grant[],
    grantedByUserId: string,
    expectedVersion?: number,
  ): Promise<boolean>;
  /** Marks the member removed and drops their assignments; false on a version mismatch. */
  remove(eventId: string, memberId: string, expectedVersion?: number): Promise<boolean>;
}

/** Effective permissions of one active member, with what the guard and actions need. */
export interface MemberAccess extends EffectivePermissions {
  memberId: string;
  isOwner: boolean;
}

export interface AccessStore {
  /** Null when the user isn't an active member of a live event. */
  forUser(eventId: string, userId: string): Promise<MemberAccess | null>;
  /**
   * events.roles_version + 1 after any role or assignment change: serializes role edits per
   * event and retires every cached permission set (DatabaseDesign "row locks").
   */
  bumpRolesVersion(eventId: string): Promise<void>;
  /**
   * Drops scope rows for a deleted sub-event, and assignments left with none (they would
   * otherwise widen to the whole event). True if anything changed.
   */
  removeSubEventScopes(eventId: string, subEventId: string): Promise<boolean>;
}

export interface NewMemberInvite {
  tokenHash: Buffer;
  email: string | null;
  grants: Grant[];
  maxUses: number;
  expiresAt: Date;
  createdByUserId: string;
}

/** A member invite as accept sees it, locked for the rest of the transaction. */
export interface LockedMemberInvite extends MemberInvite {
  eventId: string;
  createdByUserId: string;
  revoked: boolean;
}

export interface MemberInviteStore {
  insert(eventId: string, invite: NewMemberInvite): Promise<MemberInvite>;
  /** select ... for update, so used_count can't pass max_uses. */
  lockByTokenHash(tokenHash: Buffer): Promise<LockedMemberInvite | null>;
  recordUse(inviteId: string): Promise<void>;
  /** False if missing or already revoked. */
  revoke(eventId: string, inviteId: string): Promise<boolean>;
}

/** The transaction handle every action receives. */
export interface CoreTx {
  users: UserStore;
  workspaces: WorkspaceStore;
  events: EventStore;
  venues: VenueStore;
  subEvents: SubEventStore;
  roles: RoleStore;
  members: MemberStore;
  access: AccessStore;
  memberInvites: MemberInviteStore;
}
