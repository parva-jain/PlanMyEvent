import { Module } from '@nestjs/common';
import { taskQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { MyTasksController, TasksController } from './tasks.controller';
import { TASK_QUERIES } from './tasks.tokens';

@Module({
  imports: [EventsModule],
  controllers: [TasksController, MyTasksController],
  providers: [
    { provide: TASK_QUERIES, inject: [DB], useFactory: (db: Database) => taskQueries(db) },
  ],
})
export class TasksModule {}
