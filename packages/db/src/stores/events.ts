import type { Event, EventModule, SubEvent, Venue } from '@pme/contracts';
import type { EventStore, SubEventStore, VenueStore } from '@pme/core';
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { eventModules, events, subEvents, venues } from '../schema/events.js';
import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';

/** Stores run inside an action's transaction, or on the pool for reads. */
type Queryable = Database | DrizzleTx;

type EventRow = typeof events.$inferSelect;
type SubEventRow = typeof subEvents.$inferSelect;
type VenueRow = typeof venues.$inferSelect;

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    type: row.type as Event['type'],
    description: row.description,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    timeZone: row.timeZone,
    status: row.status as Event['status'],
    guestScope: row.guestScope as Event['guestScope'],
    responseMode: row.responseMode as Event['responseMode'],
    budgetPaise: row.budgetPaise,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toVenue(row: VenueRow): Venue {
  return { id: row.id, name: row.name, address: row.address, mapUrl: row.mapUrl };
}

export function toSubEvent(row: SubEventRow): SubEvent {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    venueId: row.venueId,
    capacity: row.capacity,
    visibility: row.visibility as SubEvent['visibility'],
    responseMode: row.responseMode as SubEvent['responseMode'],
    groupLabel: row.groupLabel,
    notes: row.notes,
    position: row.position,
    version: row.version,
  };
}

const pgCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

/** Postgres unique_violation, e.g. a slug another event took a moment ago. Drizzle wraps the
 * driver's error, so the code may be on `cause`. */
export const isUniqueViolation = (error: unknown) =>
  pgCode(error) === '23505' || (error instanceof Error && pgCode(error.cause) === '23505');

const liveEvent = (eventId: string) => and(eq(events.id, eventId), isNull(events.deletedAt));

export function eventStore(db: Queryable): EventStore {
  return {
    async insert(event) {
      // A savepoint, so a slug collision doesn't abort the whole action's transaction.
      try {
        const [row] = await db.transaction((savepoint) =>
          savepoint.insert(events).values(event).returning(),
        );
        return toEvent(row!);
      } catch (error) {
        if (isUniqueViolation(error)) return 'slug_taken';
        throw error;
      }
    },
    async find(eventId) {
      const [row] = await db.select().from(events).where(liveEvent(eventId));
      return row ? toEvent(row) : null;
    },
    async update(eventId, expectedVersion, changes) {
      const [row] = await db
        .update(events)
        .set({ ...changes, version: sql`${events.version} + 1` })
        .where(and(liveEvent(eventId), eq(events.version, expectedVersion)))
        .returning();
      return row ? toEvent(row) : null;
    },
    async listModules(eventId) {
      const rows = await db
        .select()
        .from(eventModules)
        .where(eq(eventModules.eventId, eventId))
        .orderBy(asc(eventModules.module));
      return rows.map((row) => ({
        module: row.module as EventModule['module'],
        enabled: row.enabled,
        config: row.config as Record<string, unknown>,
      }));
    },
    async replaceModules(eventId, list) {
      await db.delete(eventModules).where(eq(eventModules.eventId, eventId));
      if (list.length) {
        await db.insert(eventModules).values(list.map((item) => ({ eventId, ...item })));
      }
    },
    async setOwner(eventId, userId) {
      await db.update(events).set({ ownerUserId: userId }).where(liveEvent(eventId));
    },
  };
}

const liveVenue = (eventId: string, venueId: string) =>
  and(eq(venues.eventId, eventId), eq(venues.id, venueId), isNull(venues.deletedAt));

export function venueStore(db: Queryable): VenueStore {
  return {
    async insert(eventId, venue) {
      const [row] = await db
        .insert(venues)
        .values({ eventId, ...venue })
        .returning();
      return toVenue(row!);
    },
    async find(eventId, venueId) {
      const [row] = await db.select().from(venues).where(liveVenue(eventId, venueId));
      return row ? toVenue(row) : null;
    },
    async update(eventId, venueId, changes) {
      if (!Object.keys(changes).length) return this.find(eventId, venueId);
      const [row] = await db
        .update(venues)
        .set(changes)
        .where(liveVenue(eventId, venueId))
        .returning();
      return row ? toVenue(row) : null;
    },
    async softDelete(eventId, venueId) {
      const deleted = await db
        .update(venues)
        .set({ deletedAt: sql`now()` })
        .where(liveVenue(eventId, venueId))
        .returning({ id: venues.id });
      if (!deleted.length) return false;
      await db
        .update(subEvents)
        .set({ venueId: null, version: sql`${subEvents.version} + 1` })
        .where(and(eq(subEvents.eventId, eventId), eq(subEvents.venueId, venueId)));
      return true;
    },
    async restore(eventId, venueId) {
      const [row] = await db
        .update(venues)
        .set({ deletedAt: null })
        .where(
          and(eq(venues.eventId, eventId), eq(venues.id, venueId), isNotNull(venues.deletedAt)),
        )
        .returning();
      return row ? toVenue(row) : null;
    },
  };
}

const liveSubEvent = (eventId: string, subEventId: string) =>
  and(eq(subEvents.eventId, eventId), eq(subEvents.id, subEventId), isNull(subEvents.deletedAt));

export function subEventStore(db: Queryable): SubEventStore {
  return {
    async insert(eventId, list) {
      if (!list.length) return [];
      const rows = await db
        .insert(subEvents)
        .values(list.map((item) => ({ eventId, ...item })))
        .returning();
      return rows.map(toSubEvent);
    },
    async find(eventId, subEventId) {
      const [row] = await db.select().from(subEvents).where(liveSubEvent(eventId, subEventId));
      return row ? toSubEvent(row) : null;
    },
    async update(eventId, subEventId, expectedVersion, changes) {
      const { startsAt, endsAt, ...rest } = changes;
      const [row] = await db
        .update(subEvents)
        .set({
          ...rest,
          ...(startsAt ? { startsAt: new Date(startsAt) } : {}),
          ...(endsAt ? { endsAt: new Date(endsAt) } : {}),
          version: sql`${subEvents.version} + 1`,
        })
        .where(and(liveSubEvent(eventId, subEventId), eq(subEvents.version, expectedVersion)))
        .returning();
      return row ? toSubEvent(row) : null;
    },
    async softDelete(eventId, subEventId, expectedVersion) {
      const rows = await db
        .update(subEvents)
        .set({ deletedAt: sql`now()`, version: sql`${subEvents.version} + 1` })
        .where(and(liveSubEvent(eventId, subEventId), eq(subEvents.version, expectedVersion)))
        .returning({ id: subEvents.id });
      return rows.length > 0;
    },
    async restore(eventId, subEventId) {
      const [row] = await db
        .update(subEvents)
        .set({ deletedAt: null, version: sql`${subEvents.version} + 1` })
        .where(
          and(
            eq(subEvents.eventId, eventId),
            eq(subEvents.id, subEventId),
            isNotNull(subEvents.deletedAt),
          ),
        )
        .returning();
      return row ? toSubEvent(row) : null;
    },
  };
}
