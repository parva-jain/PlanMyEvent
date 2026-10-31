import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ContactImportJobSchema, QUEUES } from '@pme/contracts';
import { importContacts, runAction, type ActionRuntime, type CoreTx } from '@pme/core';
import { UnrecoverableError, type Job } from 'bullmq';

import { LivePublisher } from '../live/live-publisher';
import {
  failContactImport,
  isPermanent,
  runContactImport,
  type ImportDeps,
} from './contact-import';
import { JobStatuses } from './job-status';

export const IMPORT_RUNTIME = Symbol('IMPORT_RUNTIME');

/**
 * imports queue (SystemDesign 5.3): concurrency 2, so big files don't crowd each other out.
 * Logs ids and counts only, never guests' details.
 */
@Processor(QUEUES.imports, { concurrency: 2 })
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportsProcessor.name);
  private readonly deps: ImportDeps;

  constructor(
    @Inject(IMPORT_RUNTIME) runtime: ActionRuntime<CoreTx>,
    statuses: JobStatuses,
    live: LivePublisher,
  ) {
    super();
    this.deps = {
      importChunk: (ctx, input) => runAction(runtime, ctx, importContacts, input),
      statuses: statuses.store,
      publish: (signal) => live.publish(signal),
    };
  }

  async process(job: Job<unknown>): Promise<void> {
    const data = ContactImportJobSchema.parse(job.data);
    try {
      await runContactImport(data, this.deps);
      this.logger.log(`contact import ${data.importId} finished (job ${job.id})`);
    } catch (error) {
      const lastTry = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isPermanent(error) || lastTry) {
        await failContactImport(data, this.deps, error);
        this.logger.warn(`contact import ${data.importId} failed (job ${job.id})`);
        if (isPermanent(error)) throw new UnrecoverableError('Not allowed any more');
      }
      throw error;
    }
  }
}
