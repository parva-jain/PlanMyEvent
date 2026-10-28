import { Module } from '@nestjs/common';
import { teamQueries, type Database } from '@pme/db';

import { DB } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { MemberInvitesController } from './member-invites.controller';
import { TeamController } from './team.controller';
import { TEAM_QUERIES } from './team.tokens';

@Module({
  imports: [EventsModule],
  controllers: [TeamController, MemberInvitesController],
  providers: [
    { provide: TEAM_QUERIES, inject: [DB], useFactory: (db: Database) => teamQueries(db) },
  ],
})
export class TeamModule {}
