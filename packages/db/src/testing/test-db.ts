import { eq, sql } from 'drizzle-orm';

import { createDb, createPool, type Database } from '../client.js';
import { loadDbEnv } from '../env.js';
import { users } from '../schema/auth.js';
import { workspaces } from '../schema/workspaces.js';
import { newId } from '../uuid.js';

/**
 * Helpers for tests that run against the compose (or CI) Postgres with migrations applied.
 * Each test creates its own rows with unique ids and topics, and removes them afterwards,
 * so tests can run in parallel with each other and with a local `pnpm dev`.
 */
export function connectTestDb() {
  const pool = createPool({ connectionString: loadDbEnv().DATABASE_URL, max: 4 });
  return { pool, db: createDb(pool) };
}

export async function insertTestUser(db: Database, name = 'Test User') {
  const id = newId();
  await db.insert(users).values({ id, email: `${id}@test.local`, name });
  return id;
}

export async function deleteTestUser(db: Database, userId: string) {
  await db.delete(workspaces).where(eq(workspaces.ownerUserId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/** A topic no running relay knows, so a local worker never takes these rows. */
export const testTopic = (name: string) => `test.${name}-${newId()}`;

/** Event-owned tables, children first, for removing a test's events. */
const EVENT_TABLES = [
  'activity_log',
  'task_assignees',
  'tasks',
  'expenses',
  'budget_categories',
  'attendance',
  'invitation_sub_events',
  'invitations',
  'contacts',
  'households',
  'role_assignment_scopes',
  'role_assignments',
  'member_invites',
  'members',
  'roles',
  'sub_events',
  'venues',
  'event_modules',
];

export async function deleteTestEvents(db: Database, eventIds: string[]) {
  if (!eventIds.length) return;
  const ids = sql.join(
    eventIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  // Households and contacts point at each other; break the circle first.
  await db.execute(sql`update households set primary_contact_id = null where event_id in (${ids})`);
  for (const table of EVENT_TABLES) {
    await db.execute(sql`delete from ${sql.identifier(table)} where event_id in (${ids})`);
  }
  await db.execute(sql`delete from events where id in (${ids})`);
}
