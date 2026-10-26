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
import { MeDto, UpdateMeDto } from './me.dto';

@ApiTags('account')
@Controller('me')
export class MeController {
  constructor(@Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>) {}

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
