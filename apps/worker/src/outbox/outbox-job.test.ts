import { describe, expect, it } from 'vitest';

import { outboxJob } from './outbox-job';

const row = (topic: string) => ({
  id: 1,
  eventId: null,
  topic,
  dedupeKey: 'sign-in-code-0123456789abcdef',
  payload: { template: 'sign-in-code' },
  attempts: 0,
});

describe('outboxJob', () => {
  it('routes email.critical to its queue with the dedupe key as job id', () => {
    expect(outboxJob(row('email.critical'))).toEqual({
      queue: 'email-critical',
      name: 'send',
      data: { template: 'sign-in-code' },
      options: {
        jobId: 'sign-in-code-0123456789abcdef',
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        // Sign-in codes are secret: removed from Redis as soon as the job ends.
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  });

  it('refuses topics without a route', () => {
    expect(() => outboxJob(row('nobody.knows'))).toThrow(/No route/);
  });
});
