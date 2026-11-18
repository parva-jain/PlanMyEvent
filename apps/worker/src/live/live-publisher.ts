import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  DASHBOARD_ENTITY_TYPES,
  eventRoom,
  LIVE_NAMESPACE,
  userRoom,
  type LiveSignal,
} from '@pme/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';
import { DashboardSignals } from './dashboard-signals';

/** What the emitter needs from a Redis client: it only ever publishes. */
export interface Publisher {
  publish(channel: string, message: string | Buffer): Promise<unknown>;
}

/**
 * Sends a live signal to the API's sockets through the Socket.io Redis adapter's channels
 * (the emitter speaks its protocol). The emitter doesn't wait for its publishes, so each one
 * is captured and awaited here: a Redis failure then fails the outbox row, which the relay
 * retries, instead of being lost or crashing the worker as an unhandled rejection.
 */
export async function publishLive(publisher: Publisher, signal: LiveSignal): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const capturing = {
    publish: (channel: string, message: string | Buffer) => {
      const sent = publisher.publish(channel, message);
      pending.push(sent);
      return sent;
    },
  };
  const live = new Emitter(capturing, undefined, LIVE_NAMESPACE);
  if (signal.kind === 'emit') {
    live.to(signal.room).emit(signal.event, signal.data);
  } else {
    live.in(userRoom(signal.userId)).socketsLeave(eventRoom(signal.eventId));
  }
  await Promise.all(pending);
}

/** The event whose dashboard an entity.changed signal moves, if any. */
export function dashboardEventOf(signal: LiveSignal): string | null {
  if (signal.kind !== 'emit' || signal.event !== 'entity.changed') return null;
  const { eventId, entityType } = signal.data;
  return typeof eventId === 'string' &&
    typeof entityType === 'string' &&
    DASHBOARD_ENTITY_TYPES.includes(entityType)
    ? eventId
    : null;
}

@Injectable()
export class LivePublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly dashboard: DashboardSignals;
  private readonly logger = new Logger(LivePublisher.name);

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    // Fail fast while Redis is down, so the row waits in the outbox rather than in memory.
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    // Reconnects quietly; the relay logs failed rows.
    this.redis.on('error', () => undefined);
    this.dashboard = new DashboardSignals(
      this.redis,
      (eventId) =>
        publishLive(this.redis, {
          kind: 'emit',
          room: eventRoom(eventId),
          event: 'dashboard.changed',
          data: { eventId },
        }),
      (error) => this.logger.warn(`dashboard.changed not sent: ${String(error)}`),
    );
  }

  onModuleInit(): void {
    this.redis.connect().catch(() => undefined);
  }

  /**
   * Sends the signal; for a change that moves dashboard numbers, also refreshes the dashboard
   * (new cache generation, throttled dashboard.changed). A Redis failure fails the outbox row,
   * so the relay retries both.
   */
  async publish(signal: LiveSignal): Promise<void> {
    await publishLive(this.redis, signal);
    const eventId = dashboardEventOf(signal);
    if (eventId) await this.dashboard.changed(eventId);
  }

  async onApplicationShutdown(): Promise<void> {
    this.dashboard.close();
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
