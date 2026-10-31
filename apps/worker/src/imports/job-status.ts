import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import {
  JOB_STATUS_TTL_SECONDS,
  jobStatusKey,
  StoredJobStatusSchema,
  type StoredJobStatus,
} from '@pme/contracts';
import { Redis } from 'ioredis';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';

/** What the store needs from Redis; tests pass a Map-backed fake. */
export interface KeyValue {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

/**
 * Job status in Redis for a day (APIDesign "Async jobs"). Progress information only: if
 * Redis is down the import still runs and its outcome is in Postgres, so writes never fail
 * the job.
 */
export function jobStatusStore(redis: KeyValue) {
  return {
    async get(jobId: string): Promise<StoredJobStatus | null> {
      try {
        const value = await redis.get(jobStatusKey(jobId));
        return value ? StoredJobStatusSchema.parse(JSON.parse(value)) : null;
      } catch {
        return null;
      }
    },
    async set(status: StoredJobStatus): Promise<void> {
      try {
        await redis.set(
          jobStatusKey(status.jobId),
          JSON.stringify(status),
          'EX',
          JOB_STATUS_TTL_SECONDS,
        );
      } catch {
        // Progress is best effort.
      }
    },
  };
}

export type JobStatusStore = ReturnType<typeof jobStatusStore>;

@Injectable()
export class JobStatuses implements OnModuleInit, OnApplicationShutdown {
  private readonly redis: Redis;
  readonly store: JobStatusStore;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () => undefined);
    this.store = jobStatusStore(this.redis);
  }

  onModuleInit(): void {
    this.redis.connect().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
