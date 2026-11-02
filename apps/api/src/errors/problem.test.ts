import { describe, expect, it } from 'vitest';

import { toProblem } from './problem';

describe('toProblem', () => {
  it('a lock timeout is 503 with Retry-After, not a 500', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('canceling statement due to lock timeout'), {
        code: '55P03',
      }),
    });
    expect(toProblem(wrapped)).toEqual({
      problem: expect.objectContaining({
        status: 503,
        code: 'service_unavailable',
        retryAfter: 2,
      }) as unknown,
      expected: true,
    });
    expect(toProblem(new Error('boom')).problem.status).toBe(500);
  });
});
