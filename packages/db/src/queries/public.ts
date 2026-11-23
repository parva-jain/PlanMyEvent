import type { InviteScope, PublicEvent, PublicInvite, RegistrationState } from '@pme/contracts';
import { and, asc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events, subEvents, venues } from '../schema/events.js';
import { contacts, households } from '../schema/guests.js';
import { attendance, invitationSubEvents, invitations } from '../schema/invitations.js';

/** What a link token leads to: a live invitation, a withdrawn one, or (null) nothing. */
export type InviteLookup =
  { kind: 'live'; invitationId: string; eventId: string } | { kind: 'withdrawn' };

/**
 * Reads for the public invite page (APIDesign "Public endpoints"). Everything is scoped to
 * one invitation: no query here can return another guest.
 */
export function publicQueries(db: Database) {
  return {
    /** By the SHA-256 of the link token. A deleted event's invitations don't exist. */
    async lookupInvite(tokenHash: Buffer): Promise<InviteLookup | null> {
      const [row] = await db
        .select({
          id: invitations.id,
          eventId: invitations.eventId,
          deletedAt: invitations.deletedAt,
          revokedAt: invitations.revokedAt,
        })
        .from(invitations)
        .innerJoin(events, and(eq(events.id, invitations.eventId), isNull(events.deletedAt)))
        .where(eq(invitations.tokenHash, tokenHash));
      if (!row) return null;
      if (row.deletedAt || row.revokedAt) return { kind: 'withdrawn' };
      return { kind: 'live', invitationId: row.id, eventId: row.eventId };
    },

    /** The page for one live invitation: the event, the guest's name, their scopes and answers. */
    async invitePage(eventId: string, invitationId: string): Promise<PublicInvite | null> {
      const [row] = await db
        .select({
          invitation: invitations,
          event: events,
          household: households.name,
          contact: contacts.name,
        })
        .from(invitations)
        .innerJoin(events, eq(events.id, invitations.eventId))
        .leftJoin(households, eq(households.id, invitations.householdId))
        .leftJoin(contacts, eq(contacts.id, invitations.contactId))
        .where(
          and(
            eq(invitations.eventId, eventId),
            eq(invitations.id, invitationId),
            isNull(invitations.deletedAt),
          ),
        );
      if (!row) return null;
      const { event } = row;
      const perSubEvent = event.guestScope === 'per_sub_event';

      // Sub-events: the invitation's own when per sub-event, else the event's schedule
      // (private ones are the team's).
      const linked = perSubEvent
        ? (
            await db
              .select({ id: invitationSubEvents.subEventId })
              .from(invitationSubEvents)
              .where(eq(invitationSubEvents.invitationId, invitationId))
          ).map((link) => link.id)
        : [];
      const items = await db
        .select({ subEvent: subEvents, venue: venues })
        .from(subEvents)
        .leftJoin(venues, and(eq(venues.id, subEvents.venueId), isNull(venues.deletedAt)))
        .where(
          and(
            eq(subEvents.eventId, eventId),
            isNull(subEvents.deletedAt),
            perSubEvent
              ? linked.length
                ? inArray(subEvents.id, linked)
                : sql`false`
              : ne(subEvents.visibility, 'private'),
          ),
        )
        .orderBy(asc(subEvents.startsAt), asc(subEvents.position));
      const schedule = items.map(({ subEvent, venue }) => ({
        id: subEvent.id,
        name: subEvent.name,
        startsAt: subEvent.startsAt.toISOString(),
        endsAt: subEvent.endsAt.toISOString(),
        venue: venue ? { name: venue.name, address: venue.address, mapUrl: venue.mapUrl } : null,
      }));

      const rows = await db
        .select()
        .from(attendance)
        // A cancelled registration stays visible ("Cancelled"); a withdrawn invited row doesn't.
        .where(
          and(
            eq(attendance.invitationId, invitationId),
            or(ne(attendance.status, 'cancelled'), eq(attendance.source, 'registered')),
          ),
        );
      const scopes: InviteScope[] = rows.flatMap((item) => {
        const subEvent = item.subEventId
          ? schedule.find((entry) => entry.id === item.subEventId)
          : null;
        if (item.subEventId && !subEvent) return [];
        const mode =
          (item.subEventId &&
            items.find((entry) => entry.subEvent.id === item.subEventId)?.subEvent.responseMode) ||
          event.responseMode;
        return [
          {
            subEventId: item.subEventId,
            subEvent: subEvent ?? null,
            responseMode: mode as InviteScope['responseMode'],
            canRespond: mode === 'invite_rsvp',
            canCancel:
              mode === 'open_registration' &&
              item.source === 'registered' &&
              item.status === 'registered',
            status: item.status as InviteScope['status'],
            partySize: item.partySize,
            respondedAt: item.respondedAt?.toISOString() ?? null,
          },
        ];
      });
      scopes.sort((a, b) => (a.subEvent?.startsAt ?? '').localeCompare(b.subEvent?.startsAt ?? ''));
      return {
        event: {
          name: event.name,
          slug: event.slug,
          type: event.type as PublicInvite['event']['type'],
          description: event.description,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
          timeZone: event.timeZone,
        },
        guestName: row.household ?? row.contact ?? '',
        guestScope: event.guestScope as PublicInvite['guestScope'],
        scopes,
        schedule: perSubEvent ? [] : schedule,
      };
    },
  };
}

export type PublicQueries = ReturnType<typeof publicQueries>;

/** Events with no public page at all (APIDesign: draft and archived return 404). */
const HIDDEN = ['draft', 'archived'];

/**
 * GET /v1/public/events/{slug} (APIDesign "Public endpoints"): the event and its public
 * sub-events with venues, and whether each takes registrations and how many places are left.
 * Null (404) for a draft, archived or deleted event, and for one with nothing public: no public
 * sub-event and no open registration, so a private wedding's slug shows nothing.
 */
export async function publicEventPage(
  db: Database,
  slug: string,
): Promise<{ eventId: string; page: PublicEvent } | null> {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), isNull(events.deletedAt)));
  if (!event || HIDDEN.includes(event.status)) return null;
  const perSubEvent = event.guestScope === 'per_sub_event';

  const rows = await db
    .select({ subEvent: subEvents, venue: venues })
    .from(subEvents)
    .leftJoin(venues, and(eq(venues.id, subEvents.venueId), isNull(venues.deletedAt)))
    .where(and(eq(subEvents.eventId, event.id), isNull(subEvents.deletedAt)))
    .orderBy(asc(subEvents.startsAt), asc(subEvents.id));
  const takenRows = await db
    .select({
      subEventId: attendance.subEventId,
      people: sql<string>`sum(${attendance.partySize})`,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.eventId, event.id),
        inArray(attendance.status, ['confirmed', 'registered', 'checked_in']),
      ),
    )
    .groupBy(attendance.subEventId);
  const taken = new Map(takenRows.map((row) => [row.subEventId, Number(row.people)]));
  const left = (capacity: number | null, scope: string | null) =>
    capacity === null ? null : Math.max(0, capacity - (taken.get(scope) ?? 0));
  const closed = event.status === 'completed';
  const state = (open: boolean, spotsLeft: number | null): RegistrationState =>
    !open ? 'not_open' : closed ? 'closed' : spotsLeft === 0 ? 'full' : 'open';

  const publicRows = rows.filter((row) => row.subEvent.visibility === 'public');
  const subEventsOut = publicRows.map(({ subEvent, venue }) => {
    const spotsLeft = left(subEvent.capacity, perSubEvent ? subEvent.id : null);
    const open =
      perSubEvent && (subEvent.responseMode ?? event.responseMode) === 'open_registration';
    return {
      id: subEvent.id,
      name: subEvent.name,
      startsAt: subEvent.startsAt.toISOString(),
      endsAt: subEvent.endsAt.toISOString(),
      groupLabel: subEvent.groupLabel,
      notes: subEvent.notes,
      venue: venue ? { name: venue.name, address: venue.address, mapUrl: venue.mapUrl } : null,
      capacity: subEvent.capacity,
      spotsLeft,
      registration: perSubEvent ? state(open, spotsLeft) : ('not_open' as const),
    };
  });

  let wholeEvent: PublicEvent['wholeEvent'] = null;
  if (!perSubEvent) {
    // Whole-event guests fill every sub-event: the fewest places left among those with a limit.
    const limits = rows
      .map((row) => left(row.subEvent.capacity, null))
      .filter((value): value is number => value !== null);
    const spotsLeft = limits.length ? Math.min(...limits) : null;
    wholeEvent = {
      registration: state(event.responseMode === 'open_registration', spotsLeft),
      spotsLeft,
    };
  }
  const registers = wholeEvent
    ? wholeEvent.registration !== 'not_open'
    : subEventsOut.some((item) => item.registration !== 'not_open');
  if (!publicRows.length && !registers) return null;

  return {
    eventId: event.id,
    page: {
      event: {
        name: event.name,
        slug: event.slug,
        type: event.type as PublicEvent['event']['type'],
        status: event.status as PublicEvent['event']['status'],
        description: event.description,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        timeZone: event.timeZone,
      },
      guestScope: event.guestScope as PublicEvent['guestScope'],
      subEvents: subEventsOut,
      wholeEvent,
    },
  };
}
