import { Module } from '@nestjs/common';
import { guestQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { GuestsController } from './guests.controller';
import { GUEST_QUERIES } from './guests.tokens';

@Module({
  imports: [EventsModule],
  controllers: [GuestsController],
  providers: [
    { provide: GUEST_QUERIES, inject: [DB], useFactory: (db: Database) => guestQueries(db) },
  ],
})
export class GuestsModule {}
