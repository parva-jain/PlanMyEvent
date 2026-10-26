import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { SAMPLE_QUEUE, type SampleJobData } from './sample.queue';

@Processor(SAMPLE_QUEUE, { concurrency: 2 })
export class SampleProcessor extends WorkerHost {
  private readonly logger = new Logger(SampleProcessor.name);

  process(job: Job<SampleJobData>): Promise<{ ok: true }> {
    this.logger.log(
      `processed sample job ${job.id} (attempt ${job.attemptsMade + 1}): ${job.data.message}`,
    );
    return Promise.resolve({ ok: true });
  }
}
