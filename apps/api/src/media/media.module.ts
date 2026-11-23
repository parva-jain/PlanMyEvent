import { Module } from '@nestjs/common';
import { mediaQueries, type Database } from '@pme/db';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { MEDIA_QUERIES, MediaController } from './media.controller';
import { MEDIA_STORAGE, S3MediaStorage } from './storage';

@Module({
  imports: [EventsModule],
  controllers: [MediaController],
  providers: [
    {
      provide: MEDIA_QUERIES,
      inject: [DB, API_ENV],
      useFactory: (db: Database, env: ApiEnv) => mediaQueries(db, env.MEDIA_PUBLIC_URL),
    },
    { provide: MEDIA_STORAGE, useClass: S3MediaStorage },
  ],
})
export class MediaModule {}
