import { Body, Controller, Get, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createEvent,
  EVENT_TEMPLATES,
  replaceModules,
  runAction,
  updateEvent,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import type { EventQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { UserContext } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import { EventContext, EventRoute } from './event-access';
import {
  CreatedEventDto,
  CreateEventDto,
  EventDto,
  ModulesDto,
  ReplaceModulesDto,
  TemplatesDto,
  UpdateEventDto,
  whole,
} from './events.dto';
import { EVENT_QUERIES } from './events.tokens';

@ApiTags('events')
@Controller()
export class EventsController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(EVENT_QUERIES) private readonly queries: EventQueries,
  ) {}

  /** Templates for the create-event wizard (APIDesign "Account"). */
  @Get('event-templates')
  @ZodResponse({ type: TemplatesDto })
  templates() {
    return whole(Object.values(EVENT_TEMPLATES));
  }

  /** Create from a template; the creator joins as Owner. Accepts Idempotency-Key. */
  @Post('events')
  @ZodResponse({ status: 201, type: CreatedEventDto })
  create(@UserContext() ctx: ActionContext, @Body() body: CreateEventDto) {
    return runAction(this.runtime, ctx, createEvent, body);
  }

  /** Any grant of event.view, even one scoped to a sub-event, shows the event itself. */
  @Get('events/:eventId')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: EventDto })
  async get(@Param('eventId', UuidPipe) eventId: string) {
    return (await this.queries.getEvent(eventId))!;
  }

  @Patch('events/:eventId')
  @EventRoute('event.settings')
  @ZodResponse({ type: EventDto })
  update(
    @EventContext() ctx: ActionContext,
    @IfMatch() version: number,
    @Body() body: UpdateEventDto,
  ) {
    return runAction(this.runtime, ctx, updateEvent, { expectedVersion: version, changes: body });
  }

  @Get('events/:eventId/modules')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: ModulesDto })
  async modules(@Param('eventId', UuidPipe) eventId: string) {
    return whole(await this.queries.listModules(eventId));
  }

  /** Replaces the set; If-Match is the event's version, which this bumps. */
  @Put('events/:eventId/modules')
  @EventRoute('event.settings')
  @ZodResponse({ type: ModulesDto })
  async replaceModules(
    @EventContext() ctx: ActionContext,
    @IfMatch() version: number,
    @Body() body: ReplaceModulesDto,
  ) {
    const { modules } = await runAction(this.runtime, ctx, replaceModules, {
      expectedVersion: version,
      body,
    });
    return whole(modules);
  }
}
