import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';
import { createActionRuntime, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { SCHEDULED_RUNTIME, ScheduledProcessor } from './scheduled.processor';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.scheduled })],
  providers: [
    {
      provide: SCHEDULED_RUNTIME,
      inject: [DB],
      useFactory: (db: Database) => createActionRuntime(db),
    },
    ScheduledProcessor,
  ],
})
export class ScheduledModule {}
