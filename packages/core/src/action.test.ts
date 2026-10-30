import { jobId } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import {
  placeholderHooks,
  runAction,
  type ActionDefinition,
  type ActionRuntime,
} from './action.js';
import type { ActionContext } from './context.js';
import { ActionError } from './errors.js';

interface FakeTx {
  log: string[];
}

function fakeRuntime(overrides: Partial<ActionRuntime<FakeTx>> = {}) {
  const committed: string[][] = [];
  const runtime: ActionRuntime<FakeTx> = {
    async transaction(fn) {
      const tx: FakeTx = { log: ['begin'] };
      const result = await fn(tx); // a throw skips the commit, like a rollback
      tx.log.push('commit');
      committed.push(tx.log);
      return result;
    },
    checkPermission: (tx, _ctx, permission) => {
      tx.log.push(`permission:${permission}`);
      return Promise.resolve();
    },
    recordActivity: (tx, _ctx, entries) => {
      tx.log.push(`activity:${entries.length}`);
      return Promise.resolve();
    },
    writeOutbox: (tx, _ctx, messages) => {
      tx.log.push(`outbox:${messages.map((m) => m.topic).join(',')}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { runtime, committed };
}

const ctx: ActionContext = {
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId: 'u1', memberId: 'm1' },
  eventId: 'e1',
  now: new Date('2026-10-22T00:00:00Z'),
};

const completeTask: ActionDefinition<{ taskId: string }, { version: number }, FakeTx> = {
  name: 'tasks.complete',
  permission: 'tasks.edit',
  execute(tx, _ctx, input) {
    tx.log.push(`update:${input.taskId}`);
    return Promise.resolve({
      result: { version: 2 },
      activity: [
        { action: 'update', entityType: 'task', entityId: input.taskId, before: {}, after: {} },
      ],
      outbox: [{ topic: 'entity.changed', dedupeKey: jobId('task', input.taskId, 2), payload: {} }],
    });
  },
};

describe('runAction', () => {
  it('runs permission, change, activity and outbox in one transaction, in order', async () => {
    const { runtime, committed } = fakeRuntime();

    const result = await runAction(runtime, ctx, completeTask, { taskId: 't1' });

    expect(result).toEqual({ version: 2 });
    expect(committed).toEqual([
      [
        'begin',
        'permission:tasks.edit',
        'update:t1',
        'activity:1',
        'outbox:entity.changed',
        'commit',
      ],
    ]);
  });

  it('commits nothing when the permission check fails', async () => {
    const { runtime, committed } = fakeRuntime({
      checkPermission: () => Promise.reject(new ActionError('forbidden', 'Missing tasks.edit')),
    });

    await expect(runAction(runtime, ctx, completeTask, { taskId: 't1' })).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    });
    expect(committed).toEqual([]);
  });

  it('fails closed with the placeholder permission hook', async () => {
    const { runtime } = fakeRuntime({ checkPermission: placeholderHooks.checkPermission });

    await expect(runAction(runtime, ctx, completeTask, { taskId: 't1' })).rejects.toBeInstanceOf(
      ActionError,
    );
  });

  it('refuses an event action run without an event, before touching anything', async () => {
    const { runtime, committed } = fakeRuntime();

    await expect(
      runAction(runtime, { ...ctx, eventId: null }, completeTask, { taskId: 't1' }),
    ).rejects.toThrow(/tasks\.complete needs an event/);
    expect(committed).toEqual([]);
  });

  it('rolls back an action that forgets its activity entry', async () => {
    const { runtime, committed } = fakeRuntime();
    const forgetful: ActionDefinition<{ taskId: string }, null, FakeTx> = {
      name: 'tasks.forget',
      permission: 'tasks.edit',
      execute: (tx) => {
        tx.log.push('update');
        return Promise.resolve({ result: null });
      },
    };

    await expect(runAction(runtime, ctx, forgetful, { taskId: 't1' })).rejects.toThrow(
      /tasks\.forget returned no activity/,
    );
    expect(committed).toEqual([]);
  });

  it('accepts an explicit empty activity list (nothing changed) and declared opt-outs', async () => {
    const { runtime, committed } = fakeRuntime();
    const noop: ActionDefinition<null, null, FakeTx> = {
      name: 'tasks.noop',
      permission: 'tasks.edit',
      execute: () => Promise.resolve({ result: null, activity: [] }),
    };
    const account: ActionDefinition<null, null, FakeTx> = {
      name: 'accounts.touch',
      permission: null,
      outsideEvent: true,
      noActivity: 'Account data; activity_log is per event',
      execute: () => Promise.resolve({ result: null }),
    };

    await runAction(runtime, ctx, noop, null);
    await runAction(runtime, { ...ctx, eventId: null }, account, null);
    expect(committed).toHaveLength(2);
  });
});
