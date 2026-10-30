import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { can } from '@pme/contracts';
import {
  ActionError,
  runAction,
  undoActivity,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import type { ActivityQueries, ActivityViewer } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import { EventAccess, EventContext, EventRoute } from '../events/event-access';
import { UuidPipe } from '../http/uuid.pipe';
import { ActivityPageDto, ActivityQueryDto, UndoResultDto } from './activity.dto';
import { ACTIVITY_QUERIES } from './activity.tokens';

/** Guest entries carry phones and emails; without guests.view the feed leaves them out. */
const GUEST_ENTITY_TYPES = ['household', 'contact'];

const viewerOf = (user: SessionUser, access: MemberAccess): ActivityViewer => ({
  userId: user.id,
  canUndoOthers: can(access, 'event.settings'),
  hiddenTypes: can(access, 'guests.view') ? [] : GUEST_ENTITY_TYPES,
});

/** The activity feed and undo (APIDesign "Activity", SystemDesign 5.8). */
@ApiTags('activity')
@Controller('events/:eventId/activity')
export class ActivityController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(ACTIVITY_QUERIES) private readonly queries: ActivityQueries,
  ) {}

  /** Newest first; filters entityType, entityId and actor (a user id). */
  @Get()
  @EventRoute('activity.view')
  @ZodResponse({ type: ActivityPageDto })
  list(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: ActivityQueryDto,
    @CurrentUser() user: SessionUser,
    @EventAccess() access: MemberAccess,
  ) {
    return this.queries.list(eventId, query, viewerOf(user, access));
  }

  /**
   * Any member may ask; the action allows the change's author or event.settings, then runs
   * the reversal with its own permission and version checks (409 if it changed since).
   */
  @Post(':entryId/undo')
  @EventRoute(null)
  @HttpCode(200)
  @ZodResponse({ type: UndoResultDto })
  async undo(
    @EventContext() ctx: ActionContext,
    @Param('entryId', UuidPipe) entryId: string,
    @CurrentUser() user: SessionUser,
    @EventAccess() access: MemberAccess,
  ) {
    await runAction(this.runtime, ctx, undoActivity, { entryId });
    const entry = await this.queries.undoEntry(ctx.eventId!, entryId, viewerOf(user, access));
    if (!entry) throw new ActionError('internal_error', 'Undo wrote no activity entry');
    return { entry };
  }
}
