import type {
  Event,
  EventModule,
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

/** The transaction handle every action receives. */
export interface CoreTx {
  users: UserStore;
  workspaces: WorkspaceStore;
  events: EventStore;
  venues: VenueStore;
  subEvents: SubEventStore;
}
