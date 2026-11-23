import { EnvValidationError } from '@pme/config';
import { describe, expect, it } from 'vitest';

import { loadApiEnv } from './env';

describe('loadApiEnv', () => {
  it('runs with no env at all in development, pointing at the compose services', () => {
    const env = loadApiEnv({});
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toBe('postgres://pme:pme@localhost:5432/pme');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('requires database, Redis, URLs, the auth secret, the link key and Turnstile in production', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:p@db:5432/pme',
        REDIS_URL: 'rediss://cache:6380',
        WEB_ORIGIN: 'https://planmyevent.app',
        API_URL: 'https://api.planmyevent.app',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        INVITATION_LINK_KEY: 'y'.repeat(32),
        TURNSTILE_SECRET_KEY: '0x4AAAAAAAexample',
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
        MEDIA_PUBLIC_URL: 'https://media.planmyevent.app',
      }),
    ).not.toThrow();
  });

  it('rejects a short auth secret', () => {
    expect(() => loadApiEnv({ BETTER_AUTH_SECRET: 'too-short' })).toThrow(EnvValidationError);
    expect(() => loadApiEnv({ INVITATION_LINK_KEY: 'too-short' })).toThrow(EnvValidationError);
  });

  it('caps the shutdown grace period', () => {
    expect(() => loadApiEnv({ SHUTDOWN_GRACE_SECONDS: '61' })).toThrow(EnvValidationError);
  });
});
