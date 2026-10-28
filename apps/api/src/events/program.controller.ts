import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ActionError,
  createSubEvent,
  createVenue,
  deleteSubEvent,
  deleteVenue,
  runAction,
  updateSubEvent,
  updateVenue,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import { subEventsWith } from '@pme/contracts';
import type { EventQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { ACTION_RUNTIME } from '../database/database.module';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import { EventAccess, EventContext, EventRoute } from './event-access';
import {
  CreateSubEventDto,
  CreateVenueDto,
  SubEventDto,
  SubEventsDto,
  UpdateSubEventDto,
  UpdateVenueDto,
  VenueDto,
  VenuesDto,
  whole,
} from './events.dto';
import { EVENT_QUERIES } from './events.tokens';

const found = <T>(row: T | null, what: string): T => {
  if (!row) throw new ActionError('not_found', `${what} not found`);
  return row;
};

/** Venues and sub-events of one event (APIDesign "Events and program"). */
@ApiTags('events')
@Controller('events/:eventId')
export class ProgramController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(EVENT_QUERIES) private readonly queries: EventQueries,
  ) {}

  // ---- Venues: no version column, so no If-Match --------------------------------------

  @Get('venues')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: VenuesDto })
  async venues(@Param('eventId', UuidPipe) eventId: string) {
    return whole(await this.queries.listVenues(eventId));
  }

  @Post('venues')
  @EventRoute('subevents.edit')
  @ZodResponse({ status: 201, type: VenueDto })
  createVenue(@EventContext() ctx: ActionContext, @Body() body: CreateVenueDto) {
    return runAction(this.runtime, ctx, createVenue, body);
  }

  @Patch('venues/:venueId')
  @EventRoute('subevents.edit')
  @ZodResponse({ type: VenueDto })
  updateVenue(
    @EventContext() ctx: ActionContext,
    @Param('venueId', UuidPipe) venueId: string,
    @Body() body: UpdateVenueDto,
  ) {
    return runAction(this.runtime, ctx, updateVenue, { venueId, changes: body });
  }

  @Delete('venues/:venueId')
  @EventRoute('subevents.edit')
  @HttpCode(204)
  async deleteVenue(
    @EventContext() ctx: ActionContext,
    @Param('venueId', UuidPipe) venueId: string,
  ) {
    await runAction(this.runtime, ctx, deleteVenue, { venueId });
  }

  // ---- Sub-events ------------------------------------------------------------------------

  /** Filtered, not refused: a member scoped to Mehendi sees Mehendi (APIDesign). */
  @Get('sub-events')
  @EventRoute('subevents.view', 'list')
  @ZodResponse({ type: SubEventsDto })
  async subEvents(
    @Param('eventId', UuidPipe) eventId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const visible = subEventsWith(access, 'subevents.view');
    const list = await this.queries.listSubEvents(eventId);
    return whole(visible === 'all' ? list : list.filter((item) => visible.has(item.id)));
  }

  @Post('sub-events')
  @EventRoute('subevents.edit')
  @ZodResponse({ status: 201, type: SubEventDto })
  createSubEvent(@EventContext() ctx: ActionContext, @Body() body: CreateSubEventDto) {
    return runAction(this.runtime, ctx, createSubEvent, body);
  }

  @Get('sub-events/:subEventId')
  @EventRoute('subevents.view', { param: 'subEventId' })
  @ZodResponse({ type: SubEventDto })
  async subEvent(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('subEventId', UuidPipe) subEventId: string,
  ) {
    return found(await this.queries.getSubEvent(eventId, subEventId), 'Sub-event');
  }

  @Patch('sub-events/:subEventId')
  @EventRoute('subevents.edit', { param: 'subEventId' })
  @ZodResponse({ type: SubEventDto })
  updateSubEvent(
    @EventContext() ctx: ActionContext,
    @Param('subEventId', UuidPipe) subEventId: string,
    @IfMatch() version: number,
    @Body() body: UpdateSubEventDto,
  ) {
    return runAction(this.runtime, ctx, updateSubEvent, {
      subEventId,
      expectedVersion: version,
      changes: body,
    });
  }

  @Delete('sub-events/:subEventId')
  @EventRoute('subevents.edit', { param: 'subEventId' })
  @HttpCode(204)
  async deleteSubEvent(
    @EventContext() ctx: ActionContext,
    @Param('subEventId', UuidPipe) subEventId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteSubEvent, { subEventId, expectedVersion: version });
  }
}
