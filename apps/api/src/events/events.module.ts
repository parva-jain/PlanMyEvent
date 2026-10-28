import { Module } from '@nestjs/common';
import { eventQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventAccessGuard } from './event-access';
import { PermissionCache } from './permission-cache';
import { EventsController } from './events.controller';
import { EVENT_QUERIES } from './events.tokens';
import { ProgramController } from './program.controller';

@Module({
  controllers: [EventsController, ProgramController],
  providers: [
    { provide: EVENT_QUERIES, inject: [DB], useFactory: (db: Database) => eventQueries(db) },
    PermissionCache,
    EventAccessGuard,
  ],
  exports: [EVENT_QUERIES, PermissionCache, EventAccessGuard],
})
export class EventsModule {}
