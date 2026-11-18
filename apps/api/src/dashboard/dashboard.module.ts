import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { DashboardCache } from './dashboard-cache';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [EventsModule],
  controllers: [DashboardController],
  providers: [DashboardCache],
})
export class DashboardModule {}
