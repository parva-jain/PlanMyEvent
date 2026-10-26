import { describe, expect, it } from 'vitest';

import { redactUrl } from './redact-url';

describe('redactUrl', () => {
  it('replaces invitation tokens with a short hash', () => {
    const redacted = redactUrl('/v1/public/invites/s3cr3t-token-value/rsvp');
    expect(redacted).toMatch(/^\/v1\/public\/invites\/~[0-9a-f]{8}\/rsvp$/);
    expect(redacted).not.toContain('s3cr3t');
  });

  it('redacts member invitation tokens and keeps the query string', () => {
    const redacted = redactUrl('/v1/public/member-invites/abc123?lang=hi');
    expect(redacted).toMatch(/^\/v1\/public\/member-invites\/~[0-9a-f]{8}\?lang=hi$/);
  });

  it('gives the same token the same hash, so log lines can be correlated', () => {
    expect(redactUrl('/invites/abc')).toBe(redactUrl('/invites/abc'));
    expect(redactUrl('/invites/abc')).not.toBe(redactUrl('/invites/abd'));
  });

  it('leaves other URLs unchanged', () => {
    expect(redactUrl('/v1/events/123/tasks?page=2')).toBe('/v1/events/123/tasks?page=2');
  });
});
