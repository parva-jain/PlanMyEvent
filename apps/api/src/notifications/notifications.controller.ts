import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  markNotificationsRead,
  runAction,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import type { NotificationQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, UserContext, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import {
  MarkNotificationsReadDto,
  MarkNotificationsReadResultDto,
  NotificationPageDto,
  NotificationQueryDto,
} from './notifications.dto';

export const NOTIFICATION_QUERIES = Symbol('NOTIFICATION_QUERIES');

/** My notifications, across events (APIDesign "Platform"). Signed in; nobody else's. */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(NOTIFICATION_QUERIES) private readonly queries: NotificationQueries,
  ) {}

  /** Newest first, with the unread count for the bell; ?unread=true for unread only. */
  @Get()
  @ZodResponse({ type: NotificationPageDto })
  list(@CurrentUser() user: SessionUser, @Query() query: NotificationQueryDto) {
    return this.queries.list(user.id, query);
  }

  /** Marks the given ids, or everything with { all: true }, as read. Repeats are harmless. */
  @Post('read')
  @HttpCode(200)
  @ZodResponse({ type: MarkNotificationsReadResultDto })
  read(@UserContext() ctx: ActionContext, @Body() body: MarkNotificationsReadDto) {
    return runAction(this.runtime, ctx, markNotificationsRead, body);
  }
}
