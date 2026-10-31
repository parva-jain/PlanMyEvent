import type { InviteScope, PublicInvite } from '@pme/contracts';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

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
        .where(and(eq(attendance.invitationId, invitationId), ne(attendance.status, 'cancelled')));
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
