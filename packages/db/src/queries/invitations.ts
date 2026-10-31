import type { AttendanceQuery, Invitation, InvitationQuery } from '@pme/contracts';
import { and, asc, eq, exists, gt, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events } from '../schema/events.js';
import { contacts, households } from '../schema/guests.js';
import { attendance, invitationSubEvents, invitations } from '../schema/invitations.js';
import { toAttendance, toInvitations } from '../stores/invitations.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/**
 * Which invitations a member may read: all (whole-event guests.view), those covering their
 * sub-events (guests.view scoped there), or only the cards they hand over.
 */
export type InvitationVisibility =
  | { kind: 'all' }
  | { kind: 'subEvents'; subEventIds: ReadonlySet<string> }
  | { kind: 'distributor'; memberId: string };

const covers = (subEventIds: string[]) =>
  exists(
    sql`(select 1 from ${invitationSubEvents} where ${invitationSubEvents.invitationId} = ${invitations.id} and ${inArray(invitationSubEvents.subEventId, subEventIds)})`,
  );

function visibleInvitations(visible: InvitationVisibility): SQL | undefined {
  if (visible.kind === 'all') return undefined;
  if (visible.kind === 'distributor') return eq(invitations.distributorMemberId, visible.memberId);
  return visible.subEventIds.size ? covers([...visible.subEventIds]) : sql`false`;
}

const containing = (q: string) => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Invitation and attendance reads for the API. */
export function invitationQueries(db: Database) {
  return {
    async get(eventId: string, invitationId: string): Promise<Invitation | null> {
      const rows = await db
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.eventId, eventId),
            eq(invitations.id, invitationId),
            isNull(invitations.deletedAt),
          ),
        );
      return (await toInvitations(db, rows))[0] ?? null;
    },

    /** GET E/invitations: oldest first by id, cursor-paginated, filtered to what I may see. */
    async list(
      eventId: string,
      query: InvitationQuery & { distributor?: string },
      visible: InvitationVisibility,
    ) {
      const filters: (SQL | undefined)[] = [
        eq(invitations.eventId, eventId),
        isNull(invitations.deletedAt),
        visibleInvitations(visible),
      ];
      if (query.deliveryStatus) filters.push(eq(invitations.deliveryStatus, query.deliveryStatus));
      if (query.distributor) filters.push(eq(invitations.distributorMemberId, query.distributor));
      if (query.subEventId) filters.push(covers([query.subEventId]));
      if (query.cursor) filters.push(gt(invitations.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(invitations)
        .where(and(...filters))
        .orderBy(asc(invitations.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: await toInvitations(db, page),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },

    /**
     * What the share message needs: the token version, the guest's name and phone (a
     * household's primary contact), and the event's name.
     */
    async shareInfo(eventId: string, invitationId: string) {
      const [row] = await db
        .select({
          tokenVersion: invitations.tokenVersion,
          householdName: households.name,
          contactName: contacts.name,
          contactPhone: contacts.phone,
          primaryPhone: sql<
            string | null
          >`(select phone from contacts p where p.id = ${households.primaryContactId} and p.deleted_at is null)`,
          eventName: events.name,
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
      return {
        tokenVersion: row.tokenVersion,
        guestName: row.householdName ?? row.contactName ?? '',
        phone: row.contactPhone ?? row.primaryPhone ?? null,
        eventName: row.eventName,
      };
    },

    /**
     * GET E/attendance: oldest first by id, cursor-paginated. ?subEventId=event is the whole
     * event; ?q matches the household's or contact's name. Scoped members see their sub-events.
     */
    async listAttendance(
      eventId: string,
      query: AttendanceQuery,
      visible: 'all' | ReadonlySet<string>,
    ) {
      const filters: (SQL | undefined)[] = [
        eq(attendance.eventId, eventId),
        visible === 'all'
          ? undefined
          : visible.size
            ? inArray(attendance.subEventId, [...visible])
            : sql`false`,
      ];
      if (query.subEventId === 'event') filters.push(isNull(attendance.subEventId));
      else if (query.subEventId) filters.push(eq(attendance.subEventId, query.subEventId));
      if (query.status) filters.push(eq(attendance.status, query.status));
      if (query.source) filters.push(eq(attendance.source, query.source));
      if (query.q) {
        const pattern = containing(query.q);
        filters.push(
          or(
            inArray(
              attendance.householdId,
              db
                .select({ id: households.id })
                .from(households)
                .where(and(eq(households.eventId, eventId), ilike(households.name, pattern))),
            ),
            inArray(
              attendance.contactId,
              db
                .select({ id: contacts.id })
                .from(contacts)
                .where(and(eq(contacts.eventId, eventId), ilike(contacts.name, pattern))),
            ),
          ),
        );
      }
      if (query.cursor) filters.push(gt(attendance.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(attendance)
        .where(and(...filters))
        .orderBy(asc(attendance.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: await toAttendance(db, page),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },

    getAttendance: async (eventId: string, attendanceId: string) => {
      const rows = await db
        .select()
        .from(attendance)
        .where(and(eq(attendance.eventId, eventId), eq(attendance.id, attendanceId)));
      return (await toAttendance(db, rows))[0] ?? null;
    },
  };
}

export type InvitationQueries = ReturnType<typeof invitationQueries>;
