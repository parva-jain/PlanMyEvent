import type { Event, EventModule, MyEvent, SubEvent, Venue } from '@pme/contracts';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events, subEvents, venues } from '../schema/events.js';
import { members, roleAssignments, roles } from '../schema/team.js';
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

    /** GET /v1/me/events: events where I'm an active member, with my role names. */
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
          roles: sql<string[]>`coalesce(
            array_agg(${roles.name} order by ${roles.createdAt}) filter (where ${roles.id} is not null),
            '{}'::text[])`,
        })
        .from(members)
        .innerJoin(events, and(eq(events.id, members.eventId), isNull(events.deletedAt)))
        .leftJoin(roleAssignments, eq(roleAssignments.memberId, members.id))
        .leftJoin(roles, and(eq(roles.id, roleAssignments.roleId), isNull(roles.deletedAt)))
        .where(and(eq(members.userId, userId), eq(members.status, 'active')))
        .groupBy(events.id)
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
