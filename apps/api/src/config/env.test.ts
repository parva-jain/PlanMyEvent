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

  it('requires database, Redis, URLs and the auth secret in production', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production' })).toThrow(EnvValidationError);
    expect(() =>
      loadApiEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:p@db:5432/pme',
        REDIS_URL: 'rediss://cache:6380',
        WEB_ORIGIN: 'https://planmyevent.app',
        API_URL: 'https://api.planmyevent.app',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
      }),
    ).not.toThrow();
  });

  it('rejects a short auth secret', () => {
    expect(() => loadApiEnv({ BETTER_AUTH_SECRET: 'too-short' })).toThrow(EnvValidationError);
  });

  it('caps the shutdown grace period', () => {
    expect(() => loadApiEnv({ SHUTDOWN_GRACE_SECONDS: '61' })).toThrow(EnvValidationError);
  });
});
