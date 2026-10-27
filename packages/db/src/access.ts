import type { Permission } from '@pme/contracts';
import { and, eq, isNull } from 'drizzle-orm';

import type { Database } from './client.js';
import type { DrizzleTx } from './runtime.js';
import { events } from './schema/events.js';

/**
 * Can this user use `permission` on this event? Interim rule until members and roles exist
 * (milestone 4): the event's owner holds every permission and nobody else is a member.
 * Non-members get the same answer as for a missing event (APIDesign "404 or 403"), so the
 * caller turns `false` into 404. Milestone 4 replaces this body with effective permissions,
 * including sub-event scope; callers stay the same.
 */
export async function canAccessEvent(
  db: Database | DrizzleTx,
  eventId: string,
  userId: string,
  _permission: Permission,
): Promise<boolean> {
  const [row] = await db
    .select({ ownerUserId: events.ownerUserId })
    .from(events)
    .where(and(eq(events.id, eventId), isNull(events.deletedAt)));
  return row?.ownerUserId === userId;
}
