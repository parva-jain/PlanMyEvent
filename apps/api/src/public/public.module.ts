import { Module } from '@nestjs/common';
import { publicQueries, type Database } from '@pme/db';
import type { Redis } from 'ioredis';

import { createRateLimiter } from '../auth/rate-limit';
import { DB } from '../database/database.module';
import { REDIS } from '../redis/redis.module';
import { PublicInvitesController } from './public-invites.controller';
import { PUBLIC_QUERIES, PUBLIC_READ_LIMITER, PUBLIC_WRITE_LIMITER } from './public.tokens';

/**
 * Public routes under /v1/public (CLAUDE.md rule 10). If Redis can't count, reads still go
 * through and writes are refused (SystemDesign "Failure modes").
 */
@Module({
  controllers: [PublicInvitesController],
  providers: [
    { provide: PUBLIC_QUERIES, inject: [DB], useFactory: (db: Database) => publicQueries(db) },
    {
      provide: PUBLIC_READ_LIMITER,
      inject: [REDIS],
      useFactory: (redis: Redis) => createRateLimiter(redis, 'ratelimit', { failOpen: true }),
    },
    {
      provide: PUBLIC_WRITE_LIMITER,
      inject: [REDIS],
      useFactory: (redis: Redis) => createRateLimiter(redis),
    },
  ],
})
export class PublicModule {}
