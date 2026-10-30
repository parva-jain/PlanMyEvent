import { Module } from '@nestjs/common';
import { activityQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { ActivityController } from './activity.controller';
import { ACTIVITY_QUERIES } from './activity.tokens';

@Module({
  imports: [EventsModule],
  controllers: [ActivityController],
  providers: [
    { provide: ACTIVITY_QUERIES, inject: [DB], useFactory: (db: Database) => activityQueries(db) },
  ],
})
export class ActivityModule {}
