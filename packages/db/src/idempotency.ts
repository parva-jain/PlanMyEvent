import { and, eq, lt, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { idempotencyKeys } from './schema/idempotency.js';

/** APIDesign "Idempotency-Key": keys are remembered for 24 hours. */
const WINDOW = '24 hours';

export type IdempotencyClaim =
  /** First time: run the request, then complete or release the key. */
  | { kind: 'claimed' }
  /** Same key and body already finished: send the stored response. */
  | { kind: 'replay'; status: number; body: unknown }
  /** Same key still running in another request: 409 request_in_progress. */
  | { kind: 'in_progress' }
  /** Same key with a different request: 422 idempotency_key_reused. */
  | { kind: 'reused' };

const byKey = (scope: string, key: string) =>
  and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key));

/**
 * Claims (scope, key) for this request. Infrastructure, like the outbox relay: it never
 * touches domain rows, so it writes directly rather than through a core action.
 */
export async function claimIdempotencyKey(
  db: Database,
  scope: string,
  key: string,
  requestHash: Buffer,
): Promise<IdempotencyClaim> {
  await db
    .delete(idempotencyKeys)
    .where(and(byKey(scope, key), lt(idempotencyKeys.expiresAt, sql`now()`)));
  const inserted = await db
    .insert(idempotencyKeys)
    .values({
      scope,
      key,
      requestHash,
      status: 'in_progress',
      expiresAt: sql`now() + interval '${sql.raw(WINDOW)}'`,
    })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (inserted.length) {
    return { kind: 'claimed' };
  }
  const [row] = await db.select().from(idempotencyKeys).where(byKey(scope, key));
  if (!row) {
    // Released by the first request between our insert and select: treat as still running.
    return { kind: 'in_progress' };
  }
  if (!row.requestHash.equals(requestHash)) {
    return { kind: 'reused' };
  }
  if (row.status === 'in_progress' || row.responseStatus === null) {
    return { kind: 'in_progress' };
  }
  return { kind: 'replay', status: row.responseStatus, body: row.responseBody };
}

/** Stores the response so retries replay it. */
export async function completeIdempotencyKey(
  db: Database,
  scope: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ status: 'completed', responseStatus: status, responseBody: body })
    .where(byKey(scope, key));
}

/** Forgets a key whose request failed, so the client can retry it for real. */
export async function releaseIdempotencyKey(
  db: Database,
  scope: string,
  key: string,
): Promise<void> {
  await db.delete(idempotencyKeys).where(byKey(scope, key));
}
