import type { Attendance } from '@pme/contracts';
import type { GuestScopeStore } from '@pme/core';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { events, subEvents } from '../schema/events.js';
import { attendance, invitationSubEvents, invitations } from '../schema/invitations.js';
import type { DrizzleTx } from '../runtime.js';
import { newId } from '../uuid.js';
import { toEvent } from './events.js';

/** Rows per insert or delete statement, well under Postgres's parameter limit. */
const BATCH = 1_000;

const chunks = <T>(items: readonly T[]) =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, index) =>
    items.slice(index * BATCH, (index + 1) * BATCH),
  );

/**
 * Switching guest scope (DatabaseDesign "Switching guest scope"), inside the switch's one
 * transaction. Only the event row is locked explicitly; the attendance and link rows it
 * rewrites are locked by the writes themselves.
 */
export function guestScopeStore(db: DrizzleTx): GuestScopeStore {
  return {
    async lockEvent(eventId) {
      const [row] = await db
        .select()
        .from(events)
        .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
        .for('update');
      return row ? toEvent(row) : null;
    },

    async subEventIds(eventId) {
      const rows = await db
        .select({ id: subEvents.id })
        .from(subEvents)
        .where(and(eq(subEvents.eventId, eventId), isNull(subEvents.deletedAt)))
        .orderBy(asc(subEvents.startsAt), asc(subEvents.position));
      return rows.map((row) => row.id);
    },

    async attendance(eventId) {
      const rows = await db
        .select({
          id: attendance.id,
          householdId: attendance.householdId,
          contactId: attendance.contactId,
          subEventId: attendance.subEventId,
          status: attendance.status,
          partySize: attendance.partySize,
        })
        .from(attendance)
        .where(eq(attendance.eventId, eventId));
      return rows.map((row) => ({ ...row, status: row.status as Attendance['status'] }));
    },

    async spread(eventId, ids) {
      const originals = await db
        .select()
        .from(attendance)
        .where(and(eq(attendance.eventId, eventId), isNull(attendance.subEventId)));
      // A QR code belongs to one row, so copies start without one.
      const copies = originals.flatMap((row) =>
        ids.map((subEventId) => ({
          ...row,
          id: newId(),
          subEventId,
          qrTokenHash: null,
          version: 1,
          createdAt: undefined,
          updatedAt: undefined,
        })),
      );
      for (const batch of chunks(copies)) {
        await db.insert(attendance).values(batch).onConflictDoNothing();
      }
      for (const batch of chunks(originals.map((row) => row.id))) {
        await db
          .delete(attendance)
          .where(and(eq(attendance.eventId, eventId), inArray(attendance.id, batch)));
      }
      return copies.length;
    },

    async collapse(eventId, merges) {
      // Removing the extra rows first leaves each guest one row to move to the whole event.
      for (const batch of chunks(merges.flatMap((merge) => merge.removeIds))) {
        await db
          .delete(attendance)
          .where(and(eq(attendance.eventId, eventId), inArray(attendance.id, batch)));
      }
      for (const batch of chunks(merges)) {
        await db.execute(sql`
          update ${attendance} as a
          set sub_event_id = null, status = v.status, party_size = v.party_size,
              version = a.version + 1, updated_at = now()
          from unnest(
            ${sql.param(batch.map((merge) => merge.keepId))}::uuid[],
            ${sql.param(batch.map((merge) => merge.status))}::text[],
            ${sql.param(batch.map((merge) => merge.partySize))}::smallint[]
          ) as v(id, status, party_size)
          where a.event_id = ${eventId} and a.id = v.id
        `);
      }
    },

    async setInvitationSubEvents(eventId, ids) {
      await db.delete(invitationSubEvents).where(eq(invitationSubEvents.eventId, eventId));
      if (!ids.length) return;
      await db.execute(sql`
        insert into ${invitationSubEvents} (invitation_id, event_id, sub_event_id)
        select i.id, i.event_id, s.id
        from ${invitations} as i
        cross join unnest(${sql.param(ids)}::uuid[]) as s(id)
        where i.event_id = ${eventId} and i.deleted_at is null
      `);
    },

    async setSubEventResponseModes(eventId, mode) {
      await db
        .update(subEvents)
        .set({ responseMode: mode, version: sql`${subEvents.version} + 1` })
        .where(and(eq(subEvents.eventId, eventId), isNull(subEvents.deletedAt)));
    },

    async setScope(eventId, scope) {
      const [row] = await db
        .update(events)
        .set({
          guestScope: scope,
          version: sql`${events.version} + 1`,
          contentVersion: sql`${events.contentVersion} + 1`,
        })
        .where(eq(events.id, eventId))
        .returning();
      return toEvent(row!);
    },
  };
}
