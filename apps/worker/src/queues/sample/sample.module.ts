import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { SampleProcessor } from './sample.processor';
import { SampleProducer } from './sample.producer';
import { SAMPLE_QUEUE } from './sample.queue';

@Module({
  imports: [BullModule.registerQueue({ name: SAMPLE_QUEUE })],
  providers: [SampleProcessor, SampleProducer],
})
export class SampleModule {}
