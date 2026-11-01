import type { GuestScopeJob, LiveSignal } from '@pme/contracts';
import { ActionError } from '@pme/core';
import { describe, expect, it } from 'vitest';

import { failGuestScopeSwitch, runGuestScopeSwitch, type GuestScopeDeps } from './guest-scope';
import { jobStatusStore } from './job-status';

const job: GuestScopeJob = {
  switchId: '0192f7aa-0000-7000-8000-000000000011',
  eventId: '0192f7aa-0000-7000-8000-000000000012',
  userId: '0192f7aa-0000-7000-8000-000000000013',
  guestScope: 'per_sub_event',
};

function deps(fail?: Error) {
  const values = new Map<string, string>();
  const statuses = jobStatusStore({
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value) => Promise.resolve(values.set(key, value)),
  });
  const signals: LiveSignal[] = [];
  const fake: GuestScopeDeps = {
    statuses,
    publish: (signal) => {
      signals.push(signal);
      return Promise.resolve();
    },
    switchScope: (ctx, input) => {
      expect(ctx).toMatchObject({
        eventId: job.eventId,
        actor: { kind: 'user', userId: job.userId },
      });
      return fail
        ? Promise.reject(fail)
        : Promise.resolve({ guestScope: input.guestScope, attendanceRows: 12 });
    },
  };
  return { fake, statuses, signals };
}

describe('guest scope switch job', () => {
  it('runs as the member who asked and reports running, then what changed', async () => {
    const { fake, statuses, signals } = deps();
    await runGuestScopeSwitch(job, fake);
    expect(await statuses.get(job.switchId)).toMatchObject({
      kind: 'event.guest_scope',
      status: 'succeeded',
      progress: { done: 1, total: 1 },
      result: { guestScope: 'per_sub_event', attendanceRows: 12 },
    });
    expect(signals.map((signal) => signal.kind === 'emit' && signal.data)).toMatchObject([
      { status: 'running' },
      { status: 'succeeded' },
    ]);
  });

  it('a refused switch says why; nothing changed since it is one transaction', async () => {
    const { fake, statuses } = deps(new ActionError('validation_failed', 'Add a sub-event first'));
    await expect(runGuestScopeSwitch(job, fake)).rejects.toThrow('Add a sub-event first');
    await failGuestScopeSwitch(
      job,
      fake,
      new ActionError('validation_failed', 'Add a sub-event first'),
    );
    expect(await statuses.get(job.switchId)).toMatchObject({
      status: 'failed',
      error: 'Add a sub-event first',
    });
  });
});
