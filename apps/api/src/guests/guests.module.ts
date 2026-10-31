import { Module } from '@nestjs/common';
import { guestQueries, invitationQueries, type Database } from '@pme/db';
import type { Redis } from 'ioredis';

import { DB } from '../database/database.module';
import { createRateLimiter } from '../auth/rate-limit';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { REDIS } from '../redis/redis.module';
import { GuestsController } from './guests.controller';
import { GUEST_QUERIES, IMPORT_RATE_LIMITER, INVITATION_QUERIES } from './guests.tokens';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [EventsModule, JobsModule],
  controllers: [GuestsController, InvitationsController],
  providers: [
    { provide: GUEST_QUERIES, inject: [DB], useFactory: (db: Database) => guestQueries(db) },
    {
      provide: INVITATION_QUERIES,
      inject: [DB],
      useFactory: (db: Database) => invitationQueries(db),
    },
    {
      provide: IMPORT_RATE_LIMITER,
      inject: [REDIS],
      // Signed-in route: if Redis is down, imports still go through (APIDesign "Rate limits").
      useFactory: (redis: Redis) => createRateLimiter(redis, 'ratelimit', { failOpen: true }),
    },
  ],
})
export class GuestsModule {}
