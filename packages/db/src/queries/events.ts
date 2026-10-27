import type { Event, EventModule, MyEvent, SubEvent, Venue } from '@pme/contracts';
import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events, subEvents, venues } from '../schema/events.js';
import { eventStore, subEventStore, toSubEvent, toVenue, venueStore } from '../stores/events.js';

/**
 * Read queries for the API. Reads don't need a core action (rule 1 is about writes) but
 * they live here so every query keeps its event_id filter in one place (rule 4). Callers
 * check access first (`canAccessEvent`).
 */
export function eventQueries(db: Database) {
  const eventsStore = eventStore(db);
  const venuesStore = venueStore(db);
  const subEventsStore = subEventStore(db);

  return {
    getEvent: (eventId: string): Promise<Event | null> => eventsStore.find(eventId),
    listModules: (eventId: string): Promise<EventModule[]> => eventsStore.listModules(eventId),
    getVenue: (eventId: string, venueId: string): Promise<Venue | null> =>
      venuesStore.find(eventId, venueId),
    getSubEvent: (eventId: string, subEventId: string): Promise<SubEvent | null> =>
      subEventsStore.find(eventId, subEventId),

    async listVenues(eventId: string): Promise<Venue[]> {
      const rows = await db
        .select()
        .from(venues)
        .where(and(eq(venues.eventId, eventId), isNull(venues.deletedAt)))
        .orderBy(asc(venues.createdAt), asc(venues.id));
      return rows.map(toVenue);
    },

    /** By start time, then manual position (APIDesign: unpaginated). */
    async listSubEvents(eventId: string): Promise<SubEvent[]> {
      const rows = await db
        .select()
        .from(subEvents)
        .where(and(eq(subEvents.eventId, eventId), isNull(subEvents.deletedAt)))
        .orderBy(asc(subEvents.startsAt), asc(subEvents.position), asc(subEvents.id));
      return rows.map(toSubEvent);
    },

    /** GET /v1/me/events: until members exist, the events a user owns. */
    async listEventsForUser(userId: string): Promise<MyEvent[]> {
      const rows = await db
        .select({
          id: events.id,
          slug: events.slug,
          name: events.name,
          type: events.type,
          startsOn: events.startsOn,
          endsOn: events.endsOn,
          timeZone: events.timeZone,
          status: events.status,
        })
        .from(events)
        .where(and(eq(events.ownerUserId, userId), isNull(events.deletedAt)))
        .orderBy(asc(events.startsOn), asc(events.id));
      return rows.map((row) => ({
        ...row,
        type: row.type as MyEvent['type'],
        status: row.status as MyEvent['status'],
      }));
    },
  };
}

export type EventQueries = ReturnType<typeof eventQueries>;
