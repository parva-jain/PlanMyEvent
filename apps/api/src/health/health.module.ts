import { Module } from '@nestjs/common';

import { LifecycleModule } from '../lifecycle/lifecycle.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [LifecycleModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
