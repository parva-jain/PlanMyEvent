import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { relayOutboxBatch, type OutboxRow, type RelayOptions } from './outbox-relay.js';
import { outbox } from './schema/outbox.js';
import { connectTestDb, testTopic } from './testing/test-db.js';

const { pool, db } = connectTestDb();
afterAll(() => pool.end());

const topics: string[] = [];
afterEach(async () => {
  for (const topic of topics.splice(0)) {
    await db.delete(outbox).where(eq(outbox.topic, topic));
  }
});

async function seed(name: string, count: number, extra: { availableAt?: Date } = {}) {
  const topic = testTopic(name);
  topics.push(topic);
  await db.insert(outbox).values(
    Array.from({ length: count }, (_, index) => ({
      topic,
      dedupeKey: `test-${index}`,
      payload: { index },
      ...extra,
    })),
  );
  return topic;
}

function options(topic: string, overrides: Partial<RelayOptions> = {}): RelayOptions {
  return {
    batchSize: 100,
    topics: [topic],
    publish: () => Promise.resolve(),
    isSensitive: () => false,
    retryDelayMs: () => 60_000,
    ...overrides,
  };
}

const rowsOf = (topic: string) =>
  db.select().from(outbox).where(eq(outbox.topic, topic)).orderBy(outbox.id);

describe('relayOutboxBatch', () => {
  it('publishes due rows in order and marks them published', async () => {
    const topic = await seed('order', 3);
    const seen: OutboxRow[] = [];

    const result = await relayOutboxBatch(
      db,
      options(topic, {
        publish: (row) => {
          seen.push(row);
          return Promise.resolve();
        },
      }),
    );

    expect(result).toEqual({ published: 3, failed: 0 });
    expect(seen.map((row) => row.dedupeKey)).toEqual(['test-0', 'test-1', 'test-2']);
    expect((await rowsOf(topic)).every((row) => row.publishedAt !== null)).toBe(true);
    // A second pass finds nothing left to do.
    expect(await relayOutboxBatch(db, options(topic))).toEqual({ published: 0, failed: 0 });
  });

  it('deletes sensitive rows as soon as they are published', async () => {
    const topic = await seed('sensitive', 2);
    await relayOutboxBatch(db, options(topic, { isSensitive: () => true }));
    expect(await rowsOf(topic)).toHaveLength(0);
  });

  it('keeps a failed row for a later retry, with the error and a delay', async () => {
    const topic = await seed('retry', 1);
    const result = await relayOutboxBatch(
      db,
      options(topic, { publish: () => Promise.reject(new Error('redis down')) }),
    );

    expect(result).toEqual({ published: 0, failed: 1 });
    const [row] = await rowsOf(topic);
    expect(row).toMatchObject({ attempts: 1, lastError: 'redis down', publishedAt: null });
    expect(row!.availableAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
  });

  it('leaves rows that are not due yet, and topics it was not given', async () => {
    const later = await seed('later', 1, { availableAt: new Date(Date.now() + 60_000) });
    const other = await seed('other', 1);
    expect(await relayOutboxBatch(db, options(later))).toEqual({ published: 0, failed: 0 });
    expect((await rowsOf(other))[0]!.publishedAt).toBeNull();
  });

  it('never hands the same row to two relays running at once', async () => {
    const topic = await seed('concurrent', 20);
    const seen: number[] = [];
    const slowPublish = async (row: OutboxRow) => {
      seen.push(row.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    const results = await Promise.all([
      relayOutboxBatch(db, options(topic, { batchSize: 10, publish: slowPublish })),
      relayOutboxBatch(db, options(topic, { batchSize: 10, publish: slowPublish })),
      relayOutboxBatch(db, options(topic, { batchSize: 10, publish: slowPublish })),
    ]);

    expect(new Set(seen).size).toBe(seen.length);
    expect(results.reduce((sum, result) => sum + result.published, 0)).toBe(20);
  });
});
