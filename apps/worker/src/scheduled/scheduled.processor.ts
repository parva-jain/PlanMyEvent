import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';
import { notifyDueTasks, runAction, type ActionRuntime, type CoreTx } from '@pme/core';
import {
  deleteExpiredIdempotencyKeys,
  deletePublishedOutbox,
  deleteReadNotifications,
  eventsWithTasksDue,
  type Database,
} from '@pme/db';
import type { Job, Queue } from 'bullmq';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';
import { DB } from '../database/database.module';
import {
  isScheduledJob,
  runScheduledJob,
  SCHEDULED_JOBS,
  type ScheduledDeps,
} from './scheduled-jobs';

export const SCHEDULED_RUNTIME = Symbol('SCHEDULED_RUNTIME');

/**
 * scheduled queue, concurrency 2 (SystemDesign 5.3). Registers its repeating jobs at boot with
 * upsertJobScheduler, which keeps a single schedule however many workers start.
 */
@Processor(QUEUES.scheduled, { concurrency: 2 })
export class ScheduledProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScheduledProcessor.name);
  private readonly deps: ScheduledDeps;

  constructor(
    @Inject(DB) db: Database,
    @Inject(SCHEDULED_RUNTIME) runtime: ActionRuntime<CoreTx>,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    @InjectQueue(QUEUES.scheduled) private readonly queue: Queue,
  ) {
    super();
    this.deps = {
      deletePublishedOutbox: (before) => deletePublishedOutbox(db, before),
      deleteExpiredIdempotencyKeys: (now) => deleteExpiredIdempotencyKeys(db, now),
      deleteReadNotifications: (before) => deleteReadNotifications(db, before),
      eventsWithTasksDue: (now) => eventsWithTasksDue(db, now),
      notifyDueTasks: (ctx, input) => runAction(runtime, ctx, notifyDueTasks, input),
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.SCHEDULED_JOBS_ENABLED) {
      this.logger.log('Scheduled jobs are off (SCHEDULED_JOBS_ENABLED=false)');
      return;
    }
    for (const [name, { everyMs }] of Object.entries(SCHEDULED_JOBS)) {
      await this.queue.upsertJobScheduler(
        name,
        { every: everyMs },
        {
          name,
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        },
      );
    }
    this.logger.log(`Scheduled ${Object.keys(SCHEDULED_JOBS).join(', ')}`);
  }

  async process(job: Job): Promise<void> {
    if (!isScheduledJob(job.name)) {
      this.logger.warn(`Unknown scheduled job ${job.name}`);
      return;
    }
    const count = await runScheduledJob(job.name, this.deps, new Date(), `job_${job.id}`);
    this.logger.log(`${job.name}: ${count}`);
  }
}
