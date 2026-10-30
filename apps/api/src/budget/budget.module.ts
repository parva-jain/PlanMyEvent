import { Module } from '@nestjs/common';
import { budgetQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { BudgetController } from './budget.controller';
import { BUDGET_QUERIES } from './budget.tokens';

@Module({
  imports: [EventsModule],
  controllers: [BudgetController],
  providers: [
    { provide: BUDGET_QUERIES, inject: [DB], useFactory: (db: Database) => budgetQueries(db) },
  ],
})
export class BudgetModule {}
