import type { ActionContext } from '@pme/core';
import type { DueScanTarget } from '@pme/db';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The repeating jobs on the scheduled queue (SystemDesign 5.3, DatabaseDesign "Retention").
 * Each is safe to run twice or late: deletes are by age, reminders carry dedupe keys.
 */
export const SCHEDULED_JOBS = {
  'outbox-cleanup': { everyMs: HOUR },
  'idempotency-cleanup': { everyMs: HOUR },
  'notifications-cleanup': { everyMs: DAY },
  'task-due-scan': { everyMs: 30 * 60_000 },
} as const;

export type ScheduledJobName = keyof typeof SCHEDULED_JOBS;

export const isScheduledJob = (name: string): name is ScheduledJobName =>
  Object.hasOwn(SCHEDULED_JOBS, name);

export interface ScheduledDeps {
  deletePublishedOutbox(before: Date): Promise<number>;
  deleteExpiredIdempotencyKeys(now: Date): Promise<number>;
  deleteReadNotifications(before: Date): Promise<number>;
  eventsWithTasksDue(now: Date): Promise<DueScanTarget[]>;
  /** Runs core's notifyDueTasks for one event as the system. */
  notifyDueTasks(ctx: ActionContext, input: { dueOn: string }): Promise<{ notified: number }>;
}

/** Runs one scheduled job; returns a count for the log. */
export async function runScheduledJob(
  name: ScheduledJobName,
  deps: ScheduledDeps,
  now: Date,
  requestId: string,
): Promise<number> {
  switch (name) {
    case 'outbox-cleanup':
      return deps.deletePublishedOutbox(new Date(now.getTime() - 7 * DAY));
    case 'idempotency-cleanup':
      return deps.deleteExpiredIdempotencyKeys(now);
    case 'notifications-cleanup':
      return deps.deleteReadNotifications(new Date(now.getTime() - 90 * DAY));
    case 'task-due-scan': {
      let notified = 0;
      // One transaction per event, so one failing event doesn't hold back the rest.
      const failures: unknown[] = [];
      for (const target of await deps.eventsWithTasksDue(now)) {
        const ctx: ActionContext = {
          requestId,
          channel: 'system',
          actor: { kind: 'system', name: 'scheduler' },
          eventId: target.eventId,
          now,
        };
        try {
          notified += (await deps.notifyDueTasks(ctx, { dueOn: target.dueOn })).notified;
        } catch (error) {
          failures.push(error);
        }
      }
      // Retrying the whole scan is harmless: events already done insert nothing new.
      if (failures.length) throw new AggregateError(failures, `${failures.length} events failed`);
      return notified;
    }
  }
}
