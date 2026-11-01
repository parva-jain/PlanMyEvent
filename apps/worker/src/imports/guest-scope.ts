import {
  userRoom,
  type GuestScopeJob,
  type GuestScopeResult,
  type LiveSignal,
  type StoredJobStatus,
} from '@pme/contracts';
import { ActionError, type ActionContext } from '@pme/core';

import type { JobStatusStore } from './job-status';

export interface GuestScopeDeps {
  /** core's switchGuestScope (runAction), as the member in ctx. */
  switchScope(
    ctx: ActionContext,
    input: Pick<GuestScopeJob, 'guestScope'>,
  ): Promise<GuestScopeResult>;
  statuses: JobStatusStore;
  publish(signal: LiveSignal): Promise<void>;
}

/**
 * Runs a guest-scope switch (DatabaseDesign "Switching guest scope"): one transaction as the
 * member who asked, so event.settings is checked again. The status goes running, then
 * succeeded with what changed; each step is pushed to the member's sockets as job.progress.
 * Every open screen re-fetches from the event's own entity.changed.
 */
export async function runGuestScopeSwitch(job: GuestScopeJob, deps: GuestScopeDeps) {
  const base: StoredJobStatus = {
    jobId: job.switchId,
    kind: 'event.guest_scope',
    eventId: job.eventId,
    userId: job.userId,
    status: 'running',
    progress: { done: 0, total: 1 },
    result: null,
    error: null,
  };
  await report(deps, base);
  const ctx: ActionContext = {
    requestId: job.switchId,
    channel: 'app',
    actor: { kind: 'user', userId: job.userId, memberId: null },
    eventId: job.eventId,
    now: new Date(),
  };
  const result = await deps.switchScope(ctx, { guestScope: job.guestScope });
  await report(deps, {
    ...base,
    status: 'succeeded',
    progress: { done: 1, total: 1 },
    result,
  });
}

/** Records why a switch failed, for the member who asked. Nothing changed: it's one transaction. */
export async function failGuestScopeSwitch(
  job: GuestScopeJob,
  deps: GuestScopeDeps,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof ActionError && error.code === 'forbidden'
      ? "You can no longer change this event's settings"
      : error instanceof ActionError && error.code === 'not_found'
        ? 'The event is no longer available'
        : error instanceof ActionError && error.code === 'validation_failed'
          ? error.message
          : 'The switch stopped unexpectedly; nothing was changed';
  await report(deps, {
    jobId: job.switchId,
    kind: 'event.guest_scope',
    eventId: job.eventId,
    userId: job.userId,
    status: 'failed',
    progress: { done: 0, total: 1 },
    result: null,
    error: message,
  });
}

async function report(deps: GuestScopeDeps, status: StoredJobStatus) {
  await deps.statuses.set(status);
  await deps
    .publish({
      kind: 'emit',
      room: userRoom(status.userId),
      event: 'job.progress',
      data: {
        jobId: status.jobId,
        eventId: status.eventId,
        status: status.status,
        done: status.progress.done,
        total: status.progress.total,
      },
    })
    .catch(() => undefined);
}
