import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptMemberInvite,
  hashInviteToken,
  runAction,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import type { TeamQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { Public } from '../auth/public.decorator';
import { CurrentUser, UserContext, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import { AcceptedMemberInviteDto, MemberInvitePreviewDto } from './team.dto';
import { TEAM_QUERIES } from './team.tokens';

/**
 * The join link (APIDesign "Team and roles"). The token is in the path; the request logger
 * replaces it with a hash prefix, so it never reaches logs.
 */
@ApiTags('team')
@Controller('member-invites/:token')
export class MemberInvitesController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(TEAM_QUERIES) private readonly queries: TeamQueries,
  ) {}

  /** Anyone with the link: what it offers, or 404/410 for a dead one. */
  @Get()
  @Public()
  @ZodResponse({ type: MemberInvitePreviewDto })
  preview(@Param('token') token: string) {
    return this.queries.invitePreview(hashInviteToken(token), new Date());
  }

  @Post('accept')
  @ZodResponse({ type: AcceptedMemberInviteDto })
  accept(
    @Param('token') token: string,
    @UserContext() ctx: ActionContext,
    @CurrentUser() user: SessionUser,
  ) {
    return runAction(this.runtime, ctx, acceptMemberInvite, { token, userEmail: user.email });
  }
}
