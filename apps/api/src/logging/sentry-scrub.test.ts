import type { ErrorEvent, NodeOptions } from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';

import { sentryOptions } from './sentry-scrub';

type TransactionEvent = Parameters<NonNullable<NodeOptions['beforeSendTransaction']>>[0];

const TOKEN = 'Zk3pQ9v_secret-join-token-value-43-chars-long';

describe('sentryOptions', () => {
  const options = sentryOptions('https://key@sentry.example/1');

  it('drops link tokens, cookies and authorization from error events', async () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: `https://api.example/v1/member-invites/${TOKEN}/accept`,
        headers: { Cookie: 'session=abc', authorization: 'Bearer abc', 'user-agent': 'x' },
        cookies: { session: 'abc' },
      },
      transaction: `POST /v1/member-invites/${TOKEN}/accept`,
      breadcrumbs: [{ category: 'http', data: { url: `/v1/public/invites/${TOKEN}` } }],
    };
    const sent = JSON.stringify(await options.beforeSend!(event, {}));
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain('session=abc');
    expect(sent).not.toContain('Bearer');
    expect(sent).toContain('user-agent');
  });

  it('drops link tokens from transactions and their spans', async () => {
    const event = {
      type: 'transaction',
      transaction: `GET /v1/member-invites/${TOKEN}`,
      request: { url: `/v1/member-invites/${TOKEN}` },
      contexts: {
        trace: { trace_id: 't', span_id: 's', data: { 'url.path': `/v1/member-invites/${TOKEN}` } },
      },
      spans: [
        {
          span_id: 's2',
          trace_id: 't',
          start_timestamp: 0,
          description: `GET /v1/member-invites/${TOKEN}`,
          data: { 'http.target': `/v1/member-invites/${TOKEN}` },
        },
      ],
    } as unknown as TransactionEvent;
    const sent = JSON.stringify(await options.beforeSendTransaction!(event, {}));
    expect(sent).not.toContain(TOKEN);
    expect(sent).toContain('/v1/member-invites/~');
  });
});
