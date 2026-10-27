import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';

import { EmailCriticalProcessor } from './email.processor';
import type { EmailMessage, EmailTransport } from './transports';

function processorWithFakeTransport() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = {
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
  return { processor: new EmailCriticalProcessor(transport), sent };
}

const job = (data: unknown) => ({ id: 'sign-in-code-abc', data }) as Job<unknown>;

describe('EmailCriticalProcessor', () => {
  it('renders and sends a sign-in code email', async () => {
    const { processor, sent } = processorWithFakeTransport();
    await processor.process(
      job({
        template: 'sign-in-code',
        to: 'arjun@example.com',
        code: '123456',
        expiresInMinutes: 5,
      }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('arjun@example.com');
    expect(sent[0]?.subject).toContain('123456');
  });

  it('rejects a malformed job instead of sending something wrong', async () => {
    const { processor, sent } = processorWithFakeTransport();
    await expect(processor.process(job({ template: 'sign-in-code', to: 'x' }))).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });
});
