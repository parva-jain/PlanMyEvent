import type { Contact, ContactQuery, Household, HouseholdQuery } from '@pme/contracts';
import { and, asc, eq, gt, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { contacts, households } from '../schema/guests.js';
import { contactStore, householdStore, toContacts, toHousehold } from '../stores/guests.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/** `%q%` for ILIKE, with the user's own % and _ taken literally (the trigram index serves it). */
const containing = (q: string) => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Contact and household reads for the API; callers check guests.view for the whole event. */
export function guestQueries(db: Database) {
  const contactsOf = contactStore(db);
  const householdsOf = householdStore(db);
  return {
    getContact: (eventId: string, contactId: string): Promise<Contact | null> =>
      contactsOf.find(eventId, contactId),

    getHousehold: (eventId: string, householdId: string): Promise<Household | null> =>
      householdsOf.find(eventId, householdId),

    /**
     * GET E/contacts: oldest first by id, cursor-paginated. ?q matches name, email or phone;
     * ?tag one tag exactly; ?householdId its live members.
     */
    async listContacts(eventId: string, query: ContactQuery) {
      const filters: (SQL | undefined)[] = [
        eq(contacts.eventId, eventId),
        isNull(contacts.deletedAt),
      ];
      if (query.q) {
        const pattern = containing(query.q);
        const digits = query.q.replace(/\D/g, '');
        filters.push(
          or(
            ilike(contacts.name, pattern),
            ilike(contacts.email, pattern),
            digits.length >= 4 ? ilike(contacts.phone, `%${digits}%`) : undefined,
          ),
        );
      }
      if (query.tag) filters.push(sql`${contacts.tags} @> array[${query.tag}]::text[]`);
      if (query.householdId) filters.push(eq(contacts.householdId, query.householdId));
      if (query.cursor) filters.push(gt(contacts.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(contacts)
        .where(and(...filters))
        .orderBy(asc(contacts.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: await toContacts(db, page),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },

    /** GET E/households: oldest first by id, cursor-paginated; ?q matches the name. */
    async listHouseholds(eventId: string, query: HouseholdQuery) {
      const filters: (SQL | undefined)[] = [
        eq(households.eventId, eventId),
        isNull(households.deletedAt),
      ];
      if (query.q) filters.push(ilike(households.name, containing(query.q)));
      if (query.cursor) filters.push(gt(households.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(households)
        .where(and(...filters))
        .orderBy(asc(households.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: page.map(toHousehold),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },
  };
}

export type GuestQueries = ReturnType<typeof guestQueries>;
