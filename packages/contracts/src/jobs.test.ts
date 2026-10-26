import { describe, expect, it } from 'vitest';

import { jobId } from './jobs.js';

describe('jobId', () => {
  it('joins parts with dashes, so the same inputs give the same id', () => {
    const invitation = '0199f3a2-7c1e-7b40-9a3e-5d2f1c8b6a90';
    expect(jobId('invite-email', invitation, 3)).toBe(`invite-email-${invitation}-3`);
    expect(jobId('invite-email', invitation, 3)).toBe(jobId('invite-email', invitation, 3));
  });

  it('rejects colons, which BullMQ refuses in custom ids', () => {
    expect(() => jobId('sample', 'a:b')).toThrow(/must not contain ':'/);
  });

  it('rejects plain integers, which BullMQ reserves for its own ids', () => {
    expect(() => jobId('42')).toThrow(/must not be an integer/);
  });
});
