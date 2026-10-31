import type { Attendance, AttendanceSummary, Invitation } from '@pme/contracts';
import type { AttendanceStore, InvitationStore, NewInvitation } from '@pme/core';
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { hashLinkToken, invitationToken } from '../invitation-links.js';
import type { DrizzleTx } from '../runtime.js';
import { subEvents } from '../schema/events.js';
import { contacts, households } from '../schema/guests.js';
import { attendance, invitationSubEvents, invitations } from '../schema/invitations.js';
import { newId } from '../uuid.js';
import { isUniqueViolation } from './events.js';

type Queryable = Database | DrizzleTx;
type InvitationRow = typeof invitations.$inferSelect;
type AttendanceRow = typeof attendance.$inferSelect;

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Household or contact names for rows that name one of them, deleted ones included. */
async function guestNames(
  db: Queryable,
  rows: { householdId: string | null; contactId: string | null }[],
) {
  const householdIds = [...new Set(rows.flatMap((row) => row.householdId ?? []))];
  const contactIds = [...new Set(rows.flatMap((row) => row.contactId ?? []))];
  const names = new Map<string, string>();
  if (householdIds.length) {
    for (const row of await db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(inArray(households.id, householdIds))) {
      names.set(row.id, row.name);
    }
  }
  if (contactIds.length) {
    for (const row of await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(inArray(contacts.id, contactIds))) {
      names.set(row.id, row.name);
    }
  }
  return (row: { householdId: string | null; contactId: string | null }) =>
    names.get((row.householdId ?? row.contactId)!) ?? '';
}

const toSummary = (row: AttendanceRow): AttendanceSummary => ({
  id: row.id,
  subEventId: row.subEventId,
  status: row.status as AttendanceSummary['status'],
  partySize: row.partySize,
  respondedAt: iso(row.respondedAt),
});

export async function toAttendance(db: Queryable, rows: AttendanceRow[]): Promise<Attendance[]> {
  const nameOf = await guestNames(db, rows);
  return rows.map((row) => ({
    ...toSummary(row),
    householdId: row.householdId,
    contactId: row.contactId,
    guestName: nameOf(row),
    invitationId: row.invitationId,
    source: row.source as Attendance['source'],
    checkedInAt: iso(row.checkedInAt),
    version: row.version,
  }));
}

/** Invitation rows as the API returns them: guest name, live sub-events and attendance rows. */
export async function toInvitations(db: Queryable, rows: InvitationRow[]): Promise<Invitation[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const nameOf = await guestNames(db, rows);
  const links = await db
    .select({
      invitationId: invitationSubEvents.invitationId,
      subEventId: invitationSubEvents.subEventId,
    })
    .from(invitationSubEvents)
    .innerJoin(
      subEvents,
      and(eq(subEvents.id, invitationSubEvents.subEventId), isNull(subEvents.deletedAt)),
    )
    .where(inArray(invitationSubEvents.invitationId, ids))
    .orderBy(asc(subEvents.startsAt), asc(subEvents.id));
  const rowsOf = await db
    .select()
    .from(attendance)
    .where(inArray(attendance.invitationId, ids))
    .orderBy(asc(attendance.id));
  return rows.map((row) => ({
    id: row.id,
    householdId: row.householdId,
    contactId: row.contactId,
    guestName: nameOf(row),
    deliveryStatus: row.deliveryStatus as Invitation['deliveryStatus'],
    distributorMemberId: row.distributorMemberId,
    sentAt: iso(row.sentAt),
    deliveredAt: iso(row.deliveredAt),
    lastOpenedAt: iso(row.lastOpenedAt),
    subEventIds: links
      .filter((link) => link.invitationId === row.id)
      .map((link) => link.subEventId),
    attendance: rowsOf.filter((item) => item.invitationId === row.id).map(toSummary),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  }));
}

const liveInvitation = (eventId: string, invitationId: string) =>
  and(
    eq(invitations.eventId, eventId),
    eq(invitations.id, invitationId),
    isNull(invitations.deletedAt),
  );

/**
 * Starts (or reopens) a guest's attendance row for one scope as invited. The unique key is
 * (event, sub-event, household, contact) with nulls not distinct, so a guest invited again
 * after a withdrawal gets their old row back.
 */
async function invite(
  db: Queryable,
  eventId: string,
  invitation: { id: string; householdId: string | null; contactId: string | null },
  rows: { subEventId: string | null; partySize: number }[],
) {
  if (!rows.length) return;
  await db
    .insert(attendance)
    .values(
      rows.map((row) => ({
        eventId,
        subEventId: row.subEventId,
        householdId: invitation.householdId,
        contactId: invitation.contactId,
        invitationId: invitation.id,
        source: 'invited',
        status: 'invited',
        partySize: row.partySize,
      })),
    )
    .onConflictDoUpdate({
      target: [
        attendance.eventId,
        attendance.subEventId,
        attendance.householdId,
        attendance.contactId,
      ],
      set: {
        invitationId: sql`excluded.invitation_id`,
        source: 'invited',
        status: 'invited',
        partySize: sql`excluded.party_size`,
        version: sql`${attendance.version} + 1`,
      },
    });
}

/** `key` derives link tokens; without it (the worker today) creating links is refused. */
export function invitationStore(db: Queryable, key: string | undefined): InvitationStore {
  const keyOrThrow = () => {
    if (!key) throw new Error('INVITATION_LINK_KEY is not configured');
    return key;
  };
  const one = async (rows: InvitationRow[]) =>
    rows[0] ? ((await toInvitations(db, rows))[0] ?? null) : null;
  const bump = async (eventId: string, invitationId: string, expectedVersion: number) =>
    (
      await db
        .update(invitations)
        .set({ version: sql`${invitations.version} + 1` })
        .where(and(liveInvitation(eventId, invitationId), eq(invitations.version, expectedVersion)))
        .returning()
    )[0];

  return {
    async insert(eventId, list: NewInvitation[]) {
      if (!list.length) return [];
      const signing = keyOrThrow();
      const prepared = list.map((item) => ({ ...item, id: newId() }));
      const rows = await db
        .insert(invitations)
        .values(
          prepared.map((item) => ({
            id: item.id,
            eventId,
            householdId: item.householdId,
            contactId: item.contactId,
            distributorMemberId: item.distributorMemberId,
            tokenHash: hashLinkToken(invitationToken(signing, item.id, 1)),
          })),
        )
        .returning();
      const links = prepared.flatMap((item) =>
        item.subEventIds.map((subEventId) => ({ invitationId: item.id, eventId, subEventId })),
      );
      if (links.length) await db.insert(invitationSubEvents).values(links);
      for (const item of prepared) await invite(db, eventId, item, item.attendance);
      return toInvitations(db, rows);
    },
    async find(eventId, invitationId) {
      return one(await db.select().from(invitations).where(liveInvitation(eventId, invitationId)));
    },
    async findForGuests(eventId, { householdIds, contactIds }) {
      if (!householdIds.length && !contactIds.length) return [];
      return toInvitations(
        db,
        await db
          .select()
          .from(invitations)
          .where(
            and(
              eq(invitations.eventId, eventId),
              isNull(invitations.deletedAt),
              or(
                householdIds.length ? inArray(invitations.householdId, householdIds) : undefined,
                contactIds.length ? inArray(invitations.contactId, contactIds) : undefined,
              ),
            ),
          ),
      );
    },
    async update(eventId, invitationId, expectedVersion, changes) {
      return one(
        await db
          .update(invitations)
          .set({ ...changes, version: sql`${invitations.version} + 1` })
          .where(
            and(liveInvitation(eventId, invitationId), eq(invitations.version, expectedVersion)),
          )
          .returning(),
      );
    },
    async changeSubEvents(eventId, invitationId, expectedVersion, { add, remove }) {
      const row = await bump(eventId, invitationId, expectedVersion);
      if (!row) return null;
      if (add.length) {
        await db
          .insert(invitationSubEvents)
          .values(add.map((item) => ({ invitationId, eventId, subEventId: item.subEventId })))
          .onConflictDoNothing();
        await invite(db, eventId, row, add);
      }
      if (remove.length) {
        await db
          .delete(invitationSubEvents)
          .where(
            and(
              eq(invitationSubEvents.invitationId, invitationId),
              inArray(invitationSubEvents.subEventId, remove),
            ),
          );
        await db
          .update(attendance)
          .set({ status: 'cancelled', version: sql`${attendance.version} + 1` })
          .where(
            and(
              eq(attendance.eventId, eventId),
              eq(attendance.invitationId, invitationId),
              inArray(attendance.subEventId, remove),
            ),
          );
      }
      return one([row]);
    },
    async softDelete(eventId, invitationId, expectedVersion) {
      const rows = await db
        .update(invitations)
        .set({ deletedAt: sql`now()`, version: sql`${invitations.version} + 1` })
        .where(and(liveInvitation(eventId, invitationId), eq(invitations.version, expectedVersion)))
        .returning({ id: invitations.id });
      if (!rows.length) return false;
      await db
        .update(attendance)
        .set({ status: 'cancelled', version: sql`${attendance.version} + 1` })
        .where(and(eq(attendance.eventId, eventId), eq(attendance.invitationId, invitationId)));
      return true;
    },
    async restore(eventId, invitationId, statuses) {
      let rows: InvitationRow[];
      try {
        // A savepoint: the guest invited again since breaks the one-live-invitation index.
        rows = await db.transaction((savepoint) =>
          savepoint
            .update(invitations)
            .set({ deletedAt: null, version: sql`${invitations.version} + 1` })
            .where(
              and(
                eq(invitations.eventId, eventId),
                eq(invitations.id, invitationId),
                isNotNull(invitations.deletedAt),
              ),
            )
            .returning(),
        );
      } catch (error) {
        if (isUniqueViolation(error)) return 'already_invited';
        throw error;
      }
      if (!rows.length) return null;
      for (const { subEventId, status } of statuses) {
        await db
          .update(attendance)
          .set({ status, version: sql`${attendance.version} + 1` })
          .where(
            and(
              eq(attendance.eventId, eventId),
              eq(attendance.invitationId, invitationId),
              sql`${attendance.subEventId} is not distinct from ${subEventId}`,
            ),
          );
      }
      return one(rows);
    },
    async regenerate(eventId, invitationId, expectedVersion) {
      const signing = keyOrThrow();
      const [current] = await db
        .select({ tokenVersion: invitations.tokenVersion })
        .from(invitations)
        .where(
          and(liveInvitation(eventId, invitationId), eq(invitations.version, expectedVersion)),
        );
      if (!current) return null;
      const tokenVersion = current.tokenVersion + 1;
      return one(
        await db
          .update(invitations)
          .set({
            tokenVersion,
            tokenHash: hashLinkToken(invitationToken(signing, invitationId, tokenVersion)),
            version: sql`${invitations.version} + 1`,
          })
          .where(
            and(liveInvitation(eventId, invitationId), eq(invitations.version, expectedVersion)),
          )
          .returning(),
      );
    },
  };
}

export function attendanceStore(db: Queryable): AttendanceStore {
  const one = async (rows: AttendanceRow[]) =>
    rows[0] ? ((await toAttendance(db, rows))[0] ?? null) : null;
  const of = (eventId: string, attendanceId: string) =>
    and(eq(attendance.eventId, eventId), eq(attendance.id, attendanceId));
  return {
    async find(eventId, attendanceId) {
      return one(await db.select().from(attendance).where(of(eventId, attendanceId)));
    },
    async update(eventId, attendanceId, expectedVersion, changes) {
      return one(
        await db
          .update(attendance)
          .set({ ...changes, version: sql`${attendance.version} + 1` })
          .where(and(of(eventId, attendanceId), eq(attendance.version, expectedVersion)))
          .returning(),
      );
    },
  };
}
