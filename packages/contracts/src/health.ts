import { z } from 'zod';

export const HealthLiveSchema = z.object({ status: z.literal('ok') }).meta({ id: 'HealthLive' });

export const DependencyCheckSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative().optional(),
  error: z.string().optional(),
});

export const HealthReadySchema = z
  .object({
    status: z.enum(['ok', 'error']),
    checks: z.object({
      postgres: DependencyCheckSchema,
      redis: DependencyCheckSchema,
    }),
  })
  .meta({ id: 'HealthReady' });

export type HealthLive = z.infer<typeof HealthLiveSchema>;
export type DependencyCheck = z.infer<typeof DependencyCheckSchema>;
export type HealthReady = z.infer<typeof HealthReadySchema>;
