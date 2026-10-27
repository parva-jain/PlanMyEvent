import { EnvValidationError } from '@pme/config';
import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from './env';

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@db:5432/pme',
  REDIS_URL: 'rediss://cache:6380',
  EMAIL_FROM: 'Plan My Event <hello@planmyevent.app>',
};

describe('loadWorkerEnv', () => {
  it('runs locally with no env: relay on, SMTP to Mailpit', () => {
    const env = loadWorkerEnv({});
    expect(env).toMatchObject({
      OUTBOX_RELAY_ENABLED: true,
      OUTBOX_POLL_MS: 500,
      OUTBOX_BATCH_SIZE: 100,
      EMAIL_TRANSPORT: 'smtp',
      SMTP_URL: 'smtp://localhost:1025',
    });
  });

  it('lets each relay setting be changed', () => {
    expect(
      loadWorkerEnv({
        OUTBOX_RELAY_ENABLED: 'false',
        OUTBOX_POLL_MS: '2000',
        OUTBOX_BATCH_SIZE: '10',
      }),
    ).toMatchObject({ OUTBOX_RELAY_ENABLED: false, OUTBOX_POLL_MS: 2000, OUTBOX_BATCH_SIZE: 10 });
  });

  it('requires a transport and its settings in production', () => {
    expect(() => loadWorkerEnv(production)).toThrow(EnvValidationError);
    expect(() => loadWorkerEnv({ ...production, EMAIL_TRANSPORT: 'resend' })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => loadWorkerEnv({ ...production, EMAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_URL/);
    expect(
      loadWorkerEnv({ ...production, EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_123' }),
    ).toMatchObject({ EMAIL_TRANSPORT: 'resend' });
  });
});
