import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';
import { createActionRuntime, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { MediaStorageModule } from './media-storage.module';
import { MEDIA_RUNTIME, MediaProcessor } from './media.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.media }), MediaStorageModule],
  providers: [
    {
      provide: MEDIA_RUNTIME,
      inject: [DB],
      useFactory: (db: Database) => createActionRuntime(db),
    },
    MediaProcessor,
  ],
})
export class MediaModule {}
