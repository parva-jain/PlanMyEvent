import type { Contact, Household } from '@pme/contracts';
import type { ContactStore, HouseholdStore } from '@pme/core';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { contacts, households } from '../schema/guests.js';

type Queryable = Database | DrizzleTx;
type HouseholdRow = typeof households.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;

export const toHousehold = (row: HouseholdRow): Household => ({
  id: row.id,
  name: row.name,
  expectedCount: row.expectedCount,
  primaryContactId: row.primaryContactId,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Contact rows as the API returns them. A contact whose household was deleted reads as not
 * in one; its household_id stays, so restoring the household links it again.
 */
export async function toContacts(db: Queryable, rows: ContactRow[]): Promise<Contact[]> {
  const ids = [...new Set(rows.flatMap((row) => (row.householdId ? [row.householdId] : [])))];
  const live = new Set(
    ids.length
      ? (
          await db
            .select({ id: households.id })
            .from(households)
            .where(and(inArray(households.id, ids), isNull(households.deletedAt)))
        ).map((row) => row.id)
      : [],
  );
  return rows.map((row) => ({
    id: row.id,
    householdId: row.householdId && live.has(row.householdId) ? row.householdId : null,
    name: row.name,
    phone: row.phone,
    email: row.email,
    tags: row.tags,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  }));
}

const liveHousehold = (eventId: string, householdId: string) =>
  and(
    eq(households.eventId, eventId),
    eq(households.id, householdId),
    isNull(households.deletedAt),
  );

export function householdStore(db: Queryable): HouseholdStore {
  return {
    async insert(eventId, list) {
      if (!list.length) return [];
      const rows = await db
        .insert(households)
        .values(list.map((item) => ({ eventId, ...item })))
        .returning();
      return rows.map(toHousehold);
    },
    async find(eventId, householdId) {
      const [row] = await db.select().from(households).where(liveHousehold(eventId, householdId));
      return row ? toHousehold(row) : null;
    },
    async update(eventId, householdId, expectedVersion, changes) {
      const [row] = await db
        .update(households)
        .set({ ...changes, version: sql`${households.version} + 1` })
        .where(and(liveHousehold(eventId, householdId), eq(households.version, expectedVersion)))
        .returning();
      return row ? toHousehold(row) : null;
    },
    async softDelete(eventId, householdId, expectedVersion) {
      const rows = await db
        .update(households)
        .set({ deletedAt: sql`now()`, version: sql`${households.version} + 1` })
        .where(and(liveHousehold(eventId, householdId), eq(households.version, expectedVersion)))
        .returning({ id: households.id });
      return rows.length > 0;
    },
    async restore(eventId, householdId) {
      const [row] = await db
        .update(households)
        .set({ deletedAt: null, version: sql`${households.version} + 1` })
        .where(
          and(
            eq(households.eventId, eventId),
            eq(households.id, householdId),
            isNotNull(households.deletedAt),
          ),
        )
        .returning();
      return row ? toHousehold(row) : null;
    },
  };
}

const liveContact = (eventId: string, contactId: string) =>
  and(eq(contacts.eventId, eventId), eq(contacts.id, contactId), isNull(contacts.deletedAt));

export function contactStore(db: Queryable): ContactStore {
  const one = async (rows: ContactRow[]) => (rows[0] ? (await toContacts(db, rows))[0]! : null);
  return {
    async insert(eventId, list) {
      if (!list.length) return [];
      const rows = await db
        .insert(contacts)
        .values(list.map((item) => ({ eventId, ...item })))
        .returning();
      return toContacts(db, rows);
    },
    async find(eventId, contactId) {
      return one(await db.select().from(contacts).where(liveContact(eventId, contactId)));
    },
    async update(eventId, contactId, expectedVersion, changes) {
      return one(
        await db
          .update(contacts)
          .set({ ...changes, version: sql`${contacts.version} + 1` })
          .where(and(liveContact(eventId, contactId), eq(contacts.version, expectedVersion)))
          .returning(),
      );
    },
    async softDelete(eventId, contactId, expectedVersion) {
      const rows = await db
        .update(contacts)
        .set({ deletedAt: sql`now()`, version: sql`${contacts.version} + 1` })
        .where(and(liveContact(eventId, contactId), eq(contacts.version, expectedVersion)))
        .returning({ id: contacts.id });
      return rows.length > 0;
    },
    async restore(eventId, contactId) {
      return one(
        await db
          .update(contacts)
          .set({ deletedAt: null, version: sql`${contacts.version} + 1` })
          .where(
            and(
              eq(contacts.eventId, eventId),
              eq(contacts.id, contactId),
              isNotNull(contacts.deletedAt),
            ),
          )
          .returning(),
      );
    },
  };
}
