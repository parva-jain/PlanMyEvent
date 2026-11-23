import { Module } from '@nestjs/common';
import { notificationQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { NOTIFICATION_QUERIES, NotificationsController } from './notifications.controller';

@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_QUERIES,
      inject: [DB],
      useFactory: (db: Database) => notificationQueries(db),
    },
  ],
})
export class NotificationsModule {}
