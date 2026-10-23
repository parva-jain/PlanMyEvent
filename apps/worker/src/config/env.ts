import { defineEnv, devDefault, envSchemas } from '@pme/config';

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env) {
  return defineEnv(
    {
      NODE_ENV: envSchemas.nodeEnv,
      LOG_LEVEL: envSchemas.logLevel,
      REDIS_URL: devDefault(envSchemas.redisUrl, 'redis://localhost:6379', source.NODE_ENV),
    },
    source,
  );
}

export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
