import {
  createEvent,
  createSubEvent,
  deleteSubEvent,
  runAction,
  undoActivity,
  updateSubEvent,
  type ActionContext,
} from '@pme/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { activityQueries } from './queries/activity.js';
import { eventQueries } from './queries/events.js';
import { createActionRuntime } from './runtime.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const activity = activityQueries(db);
const createdEvents: string[] = [];
let owner: string;

const ctxFor = (userId: string, eventId: string | null = null): ActionContext => ({
  requestId: 'req_activity_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date(),
});
const viewer = () => ({ userId: owner, canUndoOthers: true, hiddenTypes: [] });

async function newEvent() {
  const event = await runAction(runtime, ctxFor(owner), createEvent, {
    templateKey: 'wedding',
    name: 'Activity Test Wedding',
    startsOn: '2026-12-10',
    endsOn: '2026-12-12',
    timeZone: 'Asia/Kolkata',
  });
  createdEvents.push(event.id);
  const subEvents = await eventQueries(db).listSubEvents(event.id);
  return {
    event,
    ctx: ctxFor(owner, event.id),
    subEvent: (name: string) => subEvents.find((item) => item.name === name)!,
  };
}

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
});

afterAll(async () => {
  await deleteTestEvents(db, createdEvents);
  await deleteTestUser(db, owner);
  await pool.end();
});

describe('activity log', () => {
  it('records each change in its transaction, newest first, with only the changed fields', async () => {
    const { event, ctx, subEvent } = await newEvent();
    const haldi = subEvent('Haldi');
    await runAction(runtime, ctx, updateSubEvent, {
      subEventId: haldi.id,
      expectedVersion: haldi.version,
      changes: { capacity: 80 },
    });
    // A failed action leaves no entry.
    await expect(
      runAction(runtime, ctx, updateSubEvent, {
        subEventId: haldi.id,
        expectedVersion: 99,
        changes: { capacity: 90 },
      }),
    ).rejects.toMatchObject({ code: 'version_conflict' });

    const { data } = await activity.list(event.id, { limit: 50 }, viewer());
    expect(data.map((item) => item.action)).toEqual(['sub_event.update', 'event.create']);
    expect(data[0]).toMatchObject({
      actor: { userId: owner, label: 'Priya Sharma' },
      channel: 'app',
      entityLabel: 'Haldi',
      before: { capacity: null, version: 1 },
      after: { capacity: 80, version: 2 },
      requestId: 'req_activity_test',
      canUndo: true,
      undone: null,
    });
    // Creating the event isn't something undo reverses.
    expect(data[1]).toMatchObject({ entityLabel: 'Activity Test Wedding', canUndo: false });
  });

  it('pages with a cursor and filters by entity', async () => {
    const { event, ctx } = await newEvent();
    for (const name of ['One', 'Two', 'Three']) {
      await runAction(runtime, ctx, createSubEvent, {
        name,
        startsAt: '2026-12-11T10:00:00Z',
        endsAt: '2026-12-11T11:00:00Z',
      });
    }
    const first = await activity.list(event.id, { limit: 2 }, viewer());
    expect(first.data.map((item) => item.entityLabel)).toEqual(['Three', 'Two']);
    expect(first.hasMore).toBe(true);
    const second = await activity.list(event.id, { limit: 2, cursor: first.nextCursor! }, viewer());
    expect(second.data.map((item) => item.entityLabel)).toEqual(['One', 'Activity Test Wedding']);
    expect(second).toMatchObject({ hasMore: false, nextCursor: null });

    const two = first.data[1]!;
    const history = await activity.list(
      event.id,
      { limit: 50, entityType: 'sub_event', entityId: two.entityId },
      viewer(),
    );
    expect(history.data.map((item) => item.id)).toEqual([two.id]);
    await expect(
      activity.list(event.id, { limit: 50, cursor: 'nonsense' }, viewer()),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('undo restores a deleted sub-event and shows who undid it; others need event.settings', async () => {
    const { event, ctx, subEvent } = await newEvent();
    const mehendi = subEvent('Mehendi');
    await runAction(runtime, ctx, deleteSubEvent, { subEventId: mehendi.id, expectedVersion: 1 });
    const [deleted] = (await activity.list(event.id, { limit: 1 }, viewer())).data;
    expect(deleted).toMatchObject({ action: 'sub_event.delete', entityLabel: 'Mehendi' });
    // Someone without event.settings sees it, but can't undo another person's change.
    const [asOther] = (
      await activity.list(
        event.id,
        { limit: 1 },
        { userId: 'someone', canUndoOthers: false, hiddenTypes: [] },
      )
    ).data;
    expect(asOther!.canUndo).toBe(false);

    await runAction(runtime, ctx, undoActivity, { entryId: deleted!.id });
    const restored = await eventQueries(db).listSubEvents(event.id);
    expect(restored.map((item) => item.name)).toContain('Mehendi');

    const { data } = await activity.list(event.id, { limit: 2 }, viewer());
    expect(data[0]).toMatchObject({
      action: 'sub_event.restore',
      undoOfId: deleted!.id,
      canUndo: false,
    });
    expect(data[1]).toMatchObject({
      id: deleted!.id,
      undone: { byLabel: 'Priya Sharma', entryId: data[0]!.id },
      canUndo: false,
    });
    await expect(activity.undoEntry(event.id, deleted!.id, viewer())).resolves.toMatchObject({
      id: data[0]!.id,
    });

    // The row lock and undone_at make a second undo a clean 409.
    await expect(
      runAction(runtime, ctx, undoActivity, { entryId: deleted!.id }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'already_undone' } });
  });
});
