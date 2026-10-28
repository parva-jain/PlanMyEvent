import { randomBytes } from 'node:crypto';

import { createEvent, createSubEvent, runAction, updateEvent, type ActionContext } from '@pme/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
} from './idempotency.js';
import { createActionRuntime } from './runtime.js';
import { eventModules, events, subEvents, venues } from './schema/events.js';
import { idempotencyKeys } from './schema/idempotency.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';
import { newId } from './uuid.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
let owner: string;
let stranger: string;
const createdEvents: string[] = [];

const ctxFor = (userId: string, eventId: string | null = null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date(),
});

async function newEvent(name = 'Sharma Wedding') {
  const event = await runAction(runtime, ctxFor(owner), createEvent, {
    templateKey: 'wedding',
    name,
    startsOn: '2026-12-10',
    endsOn: '2026-12-12',
    timeZone: 'Asia/Kolkata',
    venue: { name: 'Radisson Lawn' },
  });
  createdEvents.push(event.id);
  return event;
}

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  stranger = await insertTestUser(db, 'Rahul Verma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
});

afterAll(async () => {
  await deleteTestEvents(db, createdEvents);
  await deleteTestUser(db, owner);
  await deleteTestUser(db, stranger);
  await pool.end();
});

describe('createEvent against Postgres', () => {
  it('writes the event, modules, venue and starter sub-events in one transaction', async () => {
    const event = await newEvent();
    expect(event.counts).toEqual({ subEvents: 5, venues: 1 });
    expect(
      await db.select().from(eventModules).where(eq(eventModules.eventId, event.id)),
    ).toHaveLength(3);
    const rows = await db.select().from(subEvents).where(eq(subEvents.eventId, event.id));
    expect(rows.map((row) => row.name).sort()).toEqual([
      'Haldi',
      'Mehendi',
      'Reception',
      'Sangeet',
      'Wedding',
    ]);
  });

  it('recovers from a slug collision inside the same transaction', async () => {
    const first = await newEvent('Slug Test');
    // Force the next insert to collide once by reusing the first slug through a raw insert.
    const store = (await import('./stores/events.js')).eventStore;
    const outcome = await db.transaction(async (tx) => {
      const result = await store(tx).insert({
        workspaceId: (
          await tx.select().from(workspaces).where(eq(workspaces.ownerUserId, owner))
        )[0]!.id,
        ownerUserId: owner,
        type: 'custom',
        name: 'Clash',
        slug: first.slug,
        startsOn: '2026-12-01',
        endsOn: '2026-12-01',
        timeZone: 'Asia/Kolkata',
        status: 'planning',
        responseMode: 'invite_only',
      });
      // The transaction is still usable after the failed insert.
      const [check] = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, first.id));
      return { result, stillUsable: Boolean(check) };
    });
    expect(outcome).toEqual({ result: 'slug_taken', stillUsable: true });
  });
});

describe('access', () => {
  it('answers 404 to non-members', async () => {
    const event = await newEvent();
    await expect(
      runAction(runtime, ctxFor(stranger, event.id), updateEvent, {
        expectedVersion: 1,
        changes: { name: 'Hijacked' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('version guard', () => {
  it('bumps the version and refuses a stale one with the current row', async () => {
    const event = await newEvent();
    const ctx = ctxFor(owner, event.id);
    const updated = await runAction(runtime, ctx, updateEvent, {
      expectedVersion: 1,
      changes: { budgetPaise: 50_00_000_00 },
    });
    expect(updated).toMatchObject({ version: 2, budgetPaise: 500000000 });
    await expect(
      runAction(runtime, ctx, updateEvent, { expectedVersion: 1, changes: { name: 'Stale' } }),
    ).rejects.toMatchObject({ code: 'version_conflict', details: { current: { version: 2 } } });
  });
});

describe('composite foreign keys', () => {
  it("rejects a sub-event pointing at another event's venue, even bypassing core", async () => {
    const first = await newEvent();
    const second = await newEvent();
    const [venue] = await db.select().from(venues).where(eq(venues.eventId, first.id));
    await expect(
      db.insert(subEvents).values({
        eventId: second.id,
        name: 'Cross-event',
        startsAt: new Date('2026-12-10T10:00:00Z'),
        endsAt: new Date('2026-12-10T11:00:00Z'),
        venueId: venue!.id,
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });

    // Through core, the same mistake is a field error rather than a crash.
    await expect(
      runAction(runtime, ctxFor(owner, second.id), createSubEvent, {
        name: 'Cross-event',
        startsAt: '2026-12-10T10:00:00Z',
        endsAt: '2026-12-10T11:00:00Z',
        venueId: venue!.id,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('idempotency keys', () => {
  it('claims, replays, detects reuse and in-progress, and releases', async () => {
    const scope = `user:${newId()}`;
    const key = newId();
    const hash = randomBytes(32);

    expect(await claimIdempotencyKey(db, scope, key, hash)).toEqual({ kind: 'claimed' });
    expect(await claimIdempotencyKey(db, scope, key, hash)).toEqual({ kind: 'in_progress' });
    expect(await claimIdempotencyKey(db, scope, key, randomBytes(32))).toEqual({ kind: 'reused' });

    await completeIdempotencyKey(db, scope, key, 201, { id: 'e1' });
    expect(await claimIdempotencyKey(db, scope, key, hash)).toEqual({
      kind: 'replay',
      status: 201,
      body: { id: 'e1' },
    });

    await releaseIdempotencyKey(db, scope, key);
    expect(await claimIdempotencyKey(db, scope, key, hash)).toEqual({ kind: 'claimed' });
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.scope, scope));
  });
});
