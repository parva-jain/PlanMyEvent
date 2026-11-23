import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { MediaJobSchema, QUEUES } from '@pme/contracts';
import {
  finishMediaProcessing,
  runAction,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MediaOutcome,
} from '@pme/core';
import { mediaForProcessing, type Database } from '@pme/db';
import type { Job } from 'bullmq';

import { DB } from '../database/database.module';
import { processMedia } from './process-media';
import { WORKER_STORAGE, type WorkerStorage } from './storage';

export const MEDIA_RUNTIME = Symbol('MEDIA_RUNTIME');

/**
 * media queue, concurrency 3 (SystemDesign 5.3): checks and converts each confirmed upload,
 * then records the outcome through core, which tells open screens. Storage errors retry; the
 * last failed try marks the file failed, so nothing waits forever.
 */
@Processor(QUEUES.media, { concurrency: 3 })
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(WORKER_STORAGE) private readonly storage: WorkerStorage,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const { mediaId, eventId } = MediaJobSchema.parse(job.data);
    const item = await mediaForProcessing(this.db, eventId, mediaId);
    if (!item || item.status !== 'pending') return;
    let outcome: MediaOutcome;
    try {
      outcome = await processMedia(item, this.storage);
    } catch (error) {
      const lastTry = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (!lastTry) throw error;
      this.logger.error(`media ${mediaId} failed after ${job.attemptsMade + 1} tries`);
      outcome = { status: 'failed' };
    }
    const ctx: ActionContext = {
      requestId: `job_${job.id}`,
      channel: 'system',
      actor: { kind: 'system', name: 'media' },
      eventId,
      now: new Date(),
    };
    await runAction(this.runtime, ctx, finishMediaProcessing, { mediaId, outcome });
    this.logger.log(`media ${mediaId} ${outcome.status}`);
  }
}
