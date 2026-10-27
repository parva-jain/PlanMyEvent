import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ensurePersonalWorkspace,
  runAction,
  updateProfile,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, UserContext, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import type { EventQueries } from '@pme/db';

import { MyEventsDto, whole } from '../events/events.dto';
import { EVENT_QUERIES } from '../events/events.tokens';
import { MeDto, UpdateMeDto } from './me.dto';

@ApiTags('account')
@Controller('me')
export class MeController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(EVENT_QUERIES) private readonly queries: EventQueries,
  ) {}

  /** Events I belong to (APIDesign "Account"); role names arrive with members (milestone 4). */
  @Get('events')
  @ZodResponse({ type: MyEventsDto })
  async events(@CurrentUser() user: SessionUser) {
    return whole(await this.queries.listEventsForUser(user.id));
  }

  /**
   * Profile and personal workspace (APIDesign "Account"). Ensures the workspace exists:
   * Better Auth creates users in its own transaction and runs our hook after the commit,
   * so a failed hook is repaired here on the next request (decision 010).
   */
  @Get()
  @ZodResponse({ type: MeDto })
  me(@CurrentUser() user: SessionUser, @UserContext() ctx: ActionContext) {
    return this.withWorkspace(user, ctx);
  }

  /** Name and phone; the Welcome screen sets them after a first email sign-in. */
  @Patch()
  @ZodResponse({ type: MeDto })
  async update(
    @CurrentUser() user: SessionUser,
    @UserContext() ctx: ActionContext,
    @Body() body: UpdateMeDto,
  ) {
    await runAction(this.runtime, ctx, updateProfile, body);
    return this.withWorkspace({ ...user, ...body }, ctx);
  }

  private async withWorkspace(user: SessionUser, ctx: ActionContext) {
    const workspace = await runAction(this.runtime, ctx, ensurePersonalWorkspace, {
      userId: user.id,
      userName: user.name,
    });
    return { user, workspace };
  }
}
