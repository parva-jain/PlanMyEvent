import { Inject, Injectable } from '@nestjs/common';
import {
  JOB_STATUS_TTL_SECONDS,
  jobStatusKey,
  StoredJobStatusSchema,
  type StoredJobStatus,
} from '@pme/contracts';
import { ActionError } from '@pme/core';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module';

/**
 * Job status in Redis (APIDesign "Async jobs"): the API writes "queued" when it accepts a
 * job, the worker writes the rest. Progress only; outcomes live in Postgres.
 */
@Injectable()
export class JobStatuses {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Best effort: the job runs whether or not this lands, and the worker writes it again. */
  async queued(status: Omit<StoredJobStatus, 'status' | 'result' | 'error'>): Promise<void> {
    const value: StoredJobStatus = { ...status, status: 'queued', result: null, error: null };
    await this.redis
      .set(jobStatusKey(status.jobId), JSON.stringify(value), 'EX', JOB_STATUS_TTL_SECONDS)
      .catch(() => undefined);
  }

  /** The status, for the user who started the job only; anyone else gets 404. */
  async forUser(jobId: string, userId: string): Promise<StoredJobStatus> {
    let value: string | null;
    try {
      value = await this.redis.get(jobStatusKey(jobId));
    } catch {
      throw new ActionError('service_unavailable', 'Job status is unavailable right now', {
        retryAfter: 5,
      });
    }
    const status = value ? StoredJobStatusSchema.safeParse(JSON.parse(value)) : null;
    if (!status?.success || status.data.userId !== userId) {
      throw new ActionError('not_found', 'Job not found');
    }
    return status.data;
  }
}
