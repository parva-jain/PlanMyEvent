import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '@pme/contracts';

import { LivePublisher } from '../live/live-publisher';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [
    // A producer handle for every queue an outbox route can target.
    ...Object.values(QUEUES).map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [OutboxRelayService, LivePublisher],
  exports: [OutboxRelayService],
})
export class OutboxModule {}
