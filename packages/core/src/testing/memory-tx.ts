import type { Event, EventModule, SubEvent, Venue } from '@pme/contracts';

import type { ActionRuntime, OutboxMessage } from '../action.js';
import type { CoreTx, PersonalWorkspace } from '../ports.js';

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
  const outbox: OutboxMessage[] = [];
  const takenSlugs = new Set<string>();

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

  const tx: CoreTx = {
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
        subEvent.deleted = true;
        return Promise.resolve(true);
      },
    },
  };

  const runtime: ActionRuntime<CoreTx> = {
    transaction: (fn) => fn(tx),
    // Permission checks are the runtime's job (packages/db); these tests cover the actions.
    checkPermission: () => Promise.resolve(),
    recordActivity: () => Promise.resolve(),
    writeOutbox: (_tx, _ctx, messages) => {
      outbox.push(...messages);
      return Promise.resolve();
    },
  };

  return {
    runtime,
    tx,
    profiles,
    workspaces,
    events,
    venues,
    subEvents,
    modules,
    outbox,
    takenSlugs,
  };
}
