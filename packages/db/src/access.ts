import type { Database } from './client.js';
import { events } from './schema/events.js';
import { loadAccess } from './stores/team.js';
import { and, eq, isNull } from 'drizzle-orm';

export { loadAccess };

/**
 * events.roles_version, the part of the permission cache key that retires every cached
 * set when roles or assignments change (SystemDesign 5.5). Null for a missing event.
 */
export async function rolesVersionOf(db: Database, eventId: string): Promise<number | null> {
  const [row] = await db
    .select({ rolesVersion: events.rolesVersion })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)));
  return row?.rolesVersion ?? null;
}
