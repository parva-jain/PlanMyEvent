import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import { genRequestId } from './request-id';

function call(header?: string | string[]) {
  const headers: Record<string, string> = {};
  const req = {
    headers: header === undefined ? {} : { 'x-request-id': header },
  } as IncomingMessage;
  const res = {
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as ServerResponse;
  return { id: genRequestId(req, res), echoed: headers['X-Request-Id'] };
}

describe('genRequestId', () => {
  it('generates a UUIDv7-based id when the client sends none', () => {
    const { id, echoed } = call();
    expect(id).toMatch(/^req_[0-9a-f-]{36}$/);
    expect(echoed).toBe(id);
  });

  it("keeps a well-formed client id, so a trace can span the client's logs and ours", () => {
    expect(call('client-abc.123:4').id).toBe('client-abc.123:4');
  });

  it('replaces malformed or oversized client ids instead of logging them', () => {
    expect(call('bad id with spaces').id).toMatch(/^req_/);
    expect(call('<script>').id).toMatch(/^req_/);
    expect(call('x'.repeat(129)).id).toMatch(/^req_/);
  });

  it('uses the first value when the header is repeated', () => {
    expect(call(['first', 'second']).id).toBe('first');
  });
});
