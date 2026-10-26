import { runAction, ensurePersonalWorkspace, type ActionContext } from '@pme/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createActionRuntime } from './runtime.js';
import { outbox } from './schema/outbox.js';
import { workspaces } from './schema/workspaces.js';
import { connectTestDb, deleteTestUser, insertTestUser, testTopic } from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const ctx: ActionContext = {
  requestId: 'req_test',
  channel: 'system',
  actor: { kind: 'system', name: 'test' },
  eventId: null,
  now: new Date(),
};

afterAll(() => pool.end());

describe('ensurePersonalWorkspace against Postgres', () => {
  let userId: string;
  beforeAll(async () => {
    userId = await insertTestUser(db, 'Ananya Rao');
  });
  afterAll(() => deleteTestUser(db, userId));

  it('creates exactly one workspace even when called concurrently', async () => {
    const input = { userId, userName: 'Ananya Rao' };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => runAction(runtime, ctx, ensurePersonalWorkspace, input)),
    );

    const rows = await db.select().from(workspaces).where(eq(workspaces.ownerUserId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ananya's workspace", isPersonal: true, plan: 'free' });
    expect(new Set(results.map((workspace) => workspace.id))).toEqual(new Set([rows[0]!.id]));
  });
});

describe('writeOutbox', () => {
  it('inserts the rows in the same transaction as the action, and nothing on rollback', async () => {
    const topic = testTopic('runtime');
    const writes = (fail: boolean) =>
      runAction(
        runtime,
        ctx,
        {
          name: 'test.writeOutbox',
          permission: null,
          execute: () => {
            if (fail) return Promise.reject(new Error('rolled back'));
            return Promise.resolve({
              result: undefined,
              outbox: [{ topic, dedupeKey: 'test-key', payload: { hello: 'world' } }],
            });
          },
        },
        undefined,
      );

    await expect(writes(true)).rejects.toThrow('rolled back');
    expect(await db.select().from(outbox).where(eq(outbox.topic, topic))).toHaveLength(0);

    await writes(false);
    const rows = await db.select().from(outbox).where(eq(outbox.topic, topic));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dedupeKey: 'test-key', payload: { hello: 'world' } });
    await db.delete(outbox).where(eq(outbox.topic, topic));
  });
});
