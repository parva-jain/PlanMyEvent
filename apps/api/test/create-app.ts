import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';

import { configureApp } from '../src/app';
import { AppModule } from '../src/app.module';
import { API_ENV } from '../src/config/config.module';
import { loadApiEnv } from '../src/config/env';
import { REDIS } from '../src/redis/redis.module';

export interface CreateAppOptions {
  /** Single env variables, e.g. to point at a dependency that is down. */
  env?: Record<string, string>;
  /** Replacements for providers, e.g. a fake that captures sign-in codes. */
  providers?: { token: unknown; value: unknown }[];
  /** Extra test-only controllers. */
  controllers?: Type[];
}

/** Boots the real AppModule with main.ts's HTTP setup, against the compose Postgres and Redis. */
export async function createApp({
  env = {},
  providers = [],
  controllers = [],
}: CreateAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(API_ENV)
    .useValue(loadApiEnv({ ...process.env, LOG_LEVEL: 'silent', ...env }));
  for (const { token, value } of providers) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: false,
  });
  configureApp(app);
  await app.init();
  await redisSettled(app.get<Redis>(REDIS));
  return app;
}

/**
 * The app connects to Redis in the background at boot, and readiness honestly reports
 * "down" until that finishes. Wait for the first outcome so tests don't race it.
 */
function redisSettled(redis: Redis): Promise<void> {
  if (redis.status === 'ready') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    redis.once('ready', resolve);
    redis.once('error', () => resolve());
  });
}
