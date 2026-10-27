import { Module } from '@nestjs/common';

import { EventsModule } from '../events/events.module';

import { MeController } from './me.controller';

@Module({ imports: [EventsModule], controllers: [MeController] })
export class MeModule {}
