import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { SAMPLE_QUEUE, sampleJobId, type SampleJobData } from './sample.queue';

/**
 * Enqueues one job at boot so a fresh `pnpm dev` proves the queue works end to end.
 * Real jobs will come from the outbox relay (milestone 5), not from the worker itself.
 */
@Injectable()
export class SampleProducer implements OnApplicationBootstrap {
  private readonly logger = new Logger(SampleProducer.name);

  constructor(@InjectQueue(SAMPLE_QUEUE) private readonly queue: Queue<SampleJobData>) {}

  async onApplicationBootstrap(): Promise<void> {
    const job = await this.queue.add(
      'hello',
      { message: 'worker is alive' },
      {
        jobId: sampleJobId('hello'),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        // Remove on completion so the next boot can enqueue the same id again.
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    this.logger.log(`enqueued sample job ${job.id}`);
  }
}
