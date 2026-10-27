import { eq } from 'drizzle-orm';

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
