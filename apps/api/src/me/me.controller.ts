import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ensurePersonalWorkspace,
  runAction,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import { ZodResponse } from 'nestjs-zod';

import { CurrentUser, UserContext, type SessionUser } from '../auth/session';
import { ACTION_RUNTIME } from '../database/database.module';
import { MeDto } from './me.dto';

@ApiTags('account')
@Controller('me')
export class MeController {
  constructor(@Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>) {}

  /**
   * Profile and personal workspace (APIDesign "Account"). Ensures the workspace exists:
   * Better Auth creates users in its own transaction and runs our hook after the commit,
   * so a failed hook is repaired here on the next request.
   */
  @Get()
  @ZodResponse({ type: MeDto })
  async me(@CurrentUser() user: SessionUser, @UserContext() ctx: ActionContext) {
    const workspace = await runAction(this.runtime, ctx, ensurePersonalWorkspace, {
      userId: user.id,
      userName: user.name,
    });
    return { user, workspace };
  }
}
