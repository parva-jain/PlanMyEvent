import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineEnv, devDefault, envSchemas, EnvValidationError } from './env.js';

describe('defineEnv', () => {
  const shape = {
    PORT: envSchemas.port(4000),
    REDIS_URL: envSchemas.redisUrl,
    DEBUG: envSchemas.bool(false),
  };

  it('parses and coerces values', () => {
    expect(
      defineEnv(shape, { PORT: '5000', REDIS_URL: 'redis://cache:6379', DEBUG: 'true' }),
    ).toEqual({
      PORT: 5000,
      REDIS_URL: 'redis://cache:6379',
      DEBUG: true,
    });
  });

  it('treats empty strings as unset, so defaults apply', () => {
    expect(defineEnv(shape, { PORT: '', REDIS_URL: 'redis://localhost:6379' }).PORT).toBe(4000);
  });

  it('reports every invalid variable at once', () => {
    let error: unknown;
    try {
      defineEnv(shape, { PORT: '99999', REDIS_URL: 'http://not-redis' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const message = (error as Error).message;
    expect(message).toContain('PORT');
    expect(message).toContain('REDIS_URL');
  });
});

describe('devDefault', () => {
  const schema = { DATABASE_URL: z.url() };

  it('applies the default outside production', () => {
    const env = defineEnv(
      { DATABASE_URL: devDefault(schema.DATABASE_URL, 'postgres://localhost/pme', 'development') },
      {},
    );
    expect(env.DATABASE_URL).toBe('postgres://localhost/pme');
  });

  it('requires the value in production', () => {
    expect(() =>
      defineEnv(
        { DATABASE_URL: devDefault(schema.DATABASE_URL, 'postgres://localhost/pme', 'production') },
        {},
      ),
    ).toThrow(EnvValidationError);
  });
});

describe('envSchemas', () => {
  it('accepts postgres and postgresql URLs only', () => {
    expect(envSchemas.postgresUrl.safeParse('postgres://u:p@h:5432/db').success).toBe(true);
    expect(envSchemas.postgresUrl.safeParse('postgresql://h/db').success).toBe(true);
    expect(envSchemas.postgresUrl.safeParse('mysql://h/db').success).toBe(false);
  });

  it('accepts redis and rediss (TLS) URLs only', () => {
    expect(envSchemas.redisUrl.safeParse('rediss://h:6380').success).toBe(true);
    expect(envSchemas.redisUrl.safeParse('http://h').success).toBe(false);
  });
});
