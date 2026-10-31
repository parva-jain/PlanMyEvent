import { Module } from '@nestjs/common';

import { JobStatuses } from './job-statuses';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [JobStatuses],
  exports: [JobStatuses],
})
export class JobsModule {}
