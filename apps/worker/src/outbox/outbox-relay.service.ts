import { getQueueToken } from '@nestjs/bullmq';
import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { isOutboxTopic, OUTBOX_ROUTES, type QueueName } from '@pme/contracts';
import { relayOutboxBatch, type Database, type OutboxRow } from '@pme/db';
import type { Queue } from 'bullmq';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';
import { DB } from '../database/database.module';
import { outboxJob } from './outbox-job';

const TOPICS = Object.keys(OUTBOX_ROUTES);
/** Relay retry delay when adding the job fails (Redis down): 1 s, doubling, capped at 1 min. */
const retryDelayMs = (attempts: number) => Math.min(1_000 * 2 ** (attempts - 1), 60_000);

/**
 * Moves outbox rows into BullMQ (SystemDesign 5.1). Polls every OUTBOX_POLL_MS and drains
 * full batches back to back. Several relays can run at once: rows are claimed with
 * SKIP LOCKED. Postgres LISTEN/NOTIFY can replace most polling later.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = false;
  private lastError: string | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.OUTBOX_RELAY_ENABLED) {
      this.logger.log('Outbox relay is off (OUTBOX_RELAY_ENABLED=false)');
      return;
    }
    this.logger.log(
      `Outbox relay polling every ${this.env.OUTBOX_POLL_MS} ms, ${this.env.OUTBOX_BATCH_SIZE} rows per pass`,
    );
    this.schedule(0);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** One pass; exposed for tests. Returns how many rows were published. */
  async relayOnce(): Promise<number> {
    const { published, failed } = await relayOutboxBatch(this.db, {
      batchSize: this.env.OUTBOX_BATCH_SIZE,
      topics: TOPICS,
      publish: (row) => this.publish(row),
      isSensitive: (topic) => isOutboxTopic(topic) && OUTBOX_ROUTES[topic].sensitive,
      retryDelayMs,
    });
    if (failed) {
      this.logger.warn(`${failed} outbox rows failed to publish; retrying with back-off`);
    }
    return published;
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    let published = 0;
    try {
      published = await this.relayOnce();
      if (this.lastError) {
        this.logger.log('Outbox relay recovered');
        this.lastError = undefined;
      }
    } catch (error) {
      // Postgres unavailable: log once per distinct error, keep polling.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.lastError) {
        this.logger.error(`Outbox relay pass failed: ${message}`);
        this.lastError = message;
      }
    }
    // A full batch means more may be waiting: go again right away.
    this.schedule(published >= this.env.OUTBOX_BATCH_SIZE ? 0 : this.env.OUTBOX_POLL_MS);
  }

  private async publish(row: OutboxRow): Promise<void> {
    const job = outboxJob(row);
    await this.queue(job.queue).add(job.name, job.data, job.options);
  }

  private queue(name: QueueName): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  }
}
