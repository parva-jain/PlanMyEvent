import { defineEnv, devDefault, envSchemas, EnvValidationError } from '@pme/config';
import { LOCAL_DATABASE_URL } from '@pme/db';
import { z } from 'zod';

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env) {
  const nodeEnv = source.NODE_ENV;
  const env = defineEnv(
    {
      NODE_ENV: envSchemas.nodeEnv,
      LOG_LEVEL: envSchemas.logLevel,
      DATABASE_URL: devDefault(envSchemas.postgresUrl, LOCAL_DATABASE_URL, nodeEnv),
      REDIS_URL: devDefault(envSchemas.redisUrl, 'redis://localhost:6379', nodeEnv),

      /** Outbox relay (SystemDesign 5.1). Turn off in workers that only process queues. */
      OUTBOX_RELAY_ENABLED: envSchemas.bool(true),
      /** How often the relay looks for due rows, in ms. */
      OUTBOX_POLL_MS: z.coerce.number().int().min(50).max(60_000).default(500),
      /** Rows claimed per pass. */
      OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),

      /** Repeating cleanup and reminder jobs. Every worker may register them; BullMQ keeps one schedule. */
      SCHEDULED_JOBS_ENABLED: envSchemas.bool(true),

      /** Object storage: Cloudflare R2 in production, SeaweedFS locally (decision 008). */
      S3_ENDPOINT: devDefault(envSchemas.url, 'http://localhost:8333', nodeEnv),
      /** `auto` for R2. */
      S3_REGION: z.string().min(1).default('us-east-1'),
      S3_ACCESS_KEY_ID: devDefault(z.string().min(1), 'pme-local-access', nodeEnv),
      S3_SECRET_ACCESS_KEY: devDefault(z.string().min(1), 'pme-local-secret', nodeEnv),
      /** Gallery photos (readable by anyone, behind the CDN) and receipts (signed URLs only). */
      S3_PUBLIC_BUCKET: z.string().min(1).default('pme-public'),
      S3_PRIVATE_BUCKET: z.string().min(1).default('pme-private'),
      /** `smtp` locally (Mailpit) and for self-hosting; `resend` in production. */
      EMAIL_TRANSPORT: devDefault(z.enum(['smtp', 'resend']), 'smtp', nodeEnv),
      SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
      RESEND_API_KEY: z.string().optional(),
      EMAIL_FROM: devDefault(z.string().min(3), 'Plan My Event <hello@planmyevent.local>', nodeEnv),
    },
    source,
  );

  // Rules across variables: each transport needs its own settings.
  const issues: z.core.$ZodIssue[] = [];
  const missing = (path: string, message: string) =>
    issues.push({ code: 'custom', path: [path], message, input: undefined });
  if (env.EMAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    missing('RESEND_API_KEY', 'Required when EMAIL_TRANSPORT is resend');
  }
  if (env.EMAIL_TRANSPORT === 'smtp' && !env.SMTP_URL && env.NODE_ENV === 'production') {
    missing('SMTP_URL', 'Required when EMAIL_TRANSPORT is smtp in production');
  }
  if (issues.length) {
    throw new EnvValidationError(issues);
  }
  return { ...env, SMTP_URL: env.SMTP_URL ?? 'smtp://localhost:1025' };
}

export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
