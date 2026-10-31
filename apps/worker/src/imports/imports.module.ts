import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';
import { createActionRuntime, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { LivePublisher } from '../live/live-publisher';
import { IMPORT_RUNTIME, ImportsProcessor } from './imports.processor';
import { JobStatuses } from './job-status';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.imports })],
  providers: [
    {
      provide: IMPORT_RUNTIME,
      inject: [DB],
      useFactory: (db: Database) => createActionRuntime(db),
    },
    JobStatuses,
    LivePublisher,
    ImportsProcessor,
  ],
})
export class ImportsModule {}
