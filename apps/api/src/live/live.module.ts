import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';
import { LiveGateway } from './live.gateway';

@Module({ imports: [EventsModule], providers: [LiveGateway] })
export class LiveModule {}
