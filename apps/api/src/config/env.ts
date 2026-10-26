import { defineEnv, devDefault, envSchemas } from '@pme/config';
import { LOCAL_DATABASE_URL } from '@pme/db';
import { z } from 'zod';

export function loadApiEnv(source: Record<string, string | undefined> = process.env) {
  const nodeEnv = source.NODE_ENV;
  return defineEnv(
    {
      NODE_ENV: envSchemas.nodeEnv,
      PORT: envSchemas.port(4000),
      LOG_LEVEL: envSchemas.logLevel,
      DATABASE_URL: devDefault(envSchemas.postgresUrl, LOCAL_DATABASE_URL, nodeEnv),
      REDIS_URL: devDefault(envSchemas.redisUrl, 'redis://localhost:6379', nodeEnv),
      WEB_ORIGIN: devDefault(envSchemas.url, 'http://localhost:3000', nodeEnv),
      /** This API's own public URL: Better Auth's base URL and the OAuth callback host. */
      API_URL: devDefault(envSchemas.url, 'http://localhost:4000', nodeEnv),
      /** Signs session cookies. At least 32 characters; rotate by redeploying (sessions end). */
      BETTER_AUTH_SECRET: devDefault(
        z.string().min(32),
        'local-development-secret-not-for-production',
        nodeEnv,
      ),
      /** Google sign-in is on only when both are set. */
      GOOGLE_CLIENT_ID: z.string().optional(),
      GOOGLE_CLIENT_SECRET: z.string().optional(),
      SHUTDOWN_GRACE_SECONDS: z.coerce.number().int().min(0).max(60).default(0),
      SENTRY_DSN: z.url().optional(),
      SENTRY_ENVIRONMENT: z.string().optional(),
    },
    source,
  );
}

export type ApiEnv = ReturnType<typeof loadApiEnv>;
