import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';

export const REDIS = Symbol('REDIS');

/**
 * Redis being down is a degraded state, not a crash: warn once when it goes away and
 * once when it is back, instead of on every reconnect attempt.
 */
function watchConnection(redis: Redis): void {
  const logger = new Logger('Redis');
  let unavailable = false;

  const markUnavailable = (reason: string) => {
    if (!unavailable) {
      unavailable = true;
      logger.warn(`Redis unavailable (${reason}); retrying in the background`);
    }
  };

  // 'error' covers refused connections; 'reconnecting' covers a dropped connection that
  // never errors (half-open sockets, network partitions). Not 'close': our own quit emits it.
  redis.on('error', (error: NodeJS.ErrnoException) => markUnavailable(error.code ?? error.message));
  redis.on('reconnecting', () => markUnavailable('connection lost'));
  redis.on('ready', () => {
    if (unavailable) {
      unavailable = false;
      logger.log('Redis connection restored');
    }
  });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => {
        // Fail fast instead of queueing commands: Redis is a speed layer, never required.
        const redis = new Redis(env.REDIS_URL, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 2_000,
        });
        watchConnection(redis);
        return redis;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /**
   * Connect at boot, outside any request: a lazy first connect inside a request would tie the
   * socket's async context (and so every later reconnect log line) to that request's id.
   */
  onModuleInit(): void {
    // Failures surface through the 'error' listener and readiness; the API starts regardless.
    this.redis.connect().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'ready') {
      await this.redis.quit();
    } else {
      this.redis.disconnect();
    }
  }
}
