import { Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';

const FORCE_EXIT_MS = 30_000;

/**
 * On SIGTERM, @nestjs/bullmq closes each worker: it stops taking new jobs and waits for
 * active ones. This only adds the 30 s cap from SystemDesign 5.3 so a stuck job can't
 * block a deploy; an unfinished job's lock expires and BullMQ re-queues it.
 */
@Injectable()
export class LifecycleService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(LifecycleService.name);

  beforeApplicationShutdown(signal?: string): void {
    this.logger.log(`Shutting down (${signal ?? 'close'}), finishing active jobs`);
    setTimeout(() => {
      this.logger.error('Active jobs did not finish in time, forcing exit');
      process.exit(1);
    }, FORCE_EXIT_MS).unref();
  }
}
