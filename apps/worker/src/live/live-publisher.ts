import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { eventRoom, LIVE_NAMESPACE, userRoom, type LiveSignal } from '@pme/contracts';
import { Emitter } from '@socket.io/redis-emitter';
import { Redis } from 'ioredis';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';

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

@Injectable()
export class LivePublisher implements OnModuleInit, OnApplicationShutdown {
  private readonly redis: Redis;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    // Fail fast while Redis is down, so the row waits in the outbox rather than in memory.
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    // Reconnects quietly; the relay logs failed rows.
    this.redis.on('error', () => undefined);
  }

  onModuleInit(): void {
    this.redis.connect().catch(() => undefined);
  }

  publish(signal: LiveSignal): Promise<void> {
    return publishLive(this.redis, signal);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') await this.redis.quit();
    else this.redis.disconnect();
  }
}
