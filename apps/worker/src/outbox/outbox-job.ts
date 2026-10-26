import { isOutboxTopic, OUTBOX_ROUTES, type QueueName } from '@pme/contracts';
import type { OutboxRow } from '@pme/db';
import type { JobsOptions } from 'bullmq';

/** Keep finished jobs a day for debugging, unless their payload is secret. */
const KEEP_FINISHED = { age: 24 * 60 * 60 };

export interface OutboxJob {
  queue: QueueName;
  name: string;
  data: unknown;
  options: JobsOptions;
}

/** The BullMQ job an outbox row becomes, from its topic's route in @pme/contracts. */
export function outboxJob(row: OutboxRow): OutboxJob {
  if (!isOutboxTopic(row.topic)) {
    throw new Error(`No route for outbox topic ${row.topic}`);
  }
  const route = OUTBOX_ROUTES[row.topic];
  return {
    queue: route.queue,
    name: route.job,
    data: row.payload,
    options: {
      // Deterministic id: a re-published row is ignored by BullMQ (CLAUDE.md rule 7).
      jobId: row.dedupeKey,
      attempts: route.attempts,
      backoff: { type: 'exponential', delay: route.backoffMs },
      removeOnComplete: route.sensitive ? true : KEEP_FINISHED,
      removeOnFail: route.sensitive ? true : KEEP_FINISHED,
    },
  };
}
