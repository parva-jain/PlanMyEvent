import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicInviteSchema, RsvpSchema } from '@pme/contracts';
import {
  ActionError,
  recordInvitationOpened,
  respondToInvitation,
  runAction,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import { hashLinkToken, type PublicQueries } from '@pme/db';
import type { Request } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../auth/public.decorator';
import type { RateLimiter, RateLimitRule } from '../auth/rate-limit';
import { ACTION_RUNTIME } from '../database/database.module';
import { RequireIdempotencyKey } from '../http/idempotency.interceptor';
import { PUBLIC_QUERIES, PUBLIC_READ_LIMITER, PUBLIC_WRITE_LIMITER } from './public.tokens';

export class PublicInviteDto extends createZodDto(PublicInviteSchema) {}
export class RsvpDto extends createZodDto(RsvpSchema) {}

/** APIDesign "Rate limits": the invite page and RSVP submits. */
const PAGE_PER_IP: RateLimitRule = { window: 60, max: 60 };
const PAGE_PER_TOKEN: RateLimitRule = { window: 60, max: 30 };
const RSVP_PER_TOKEN: RateLimitRule = { window: 60, max: 10 };

/**
 * A guest's invitation through their magic link (APIDesign "Public endpoints"): no account,
 * no session. The token is hashed to find the invitation; the guest then acts as themselves
 * (actor 'guest', channel public_link), and sees only their own invitation and answers.
 */
@ApiTags('public')
@Public()
@Controller('public/invites/:token')
export class PublicInvitesController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(PUBLIC_QUERIES) private readonly queries: PublicQueries,
    @Inject(PUBLIC_READ_LIMITER) private readonly reads: RateLimiter,
    @Inject(PUBLIC_WRITE_LIMITER) private readonly writes: RateLimiter,
  ) {}

  /** The invitation; 404 for an unknown link, 410 link_revoked for a withdrawn one. */
  @Get()
  @ZodResponse({ type: PublicInviteDto })
  async view(@Param('token') token: string, @Req() req: Request) {
    const hash = hashLinkToken(token);
    await this.limit(this.reads, `invite-ip:${req.ip}`, PAGE_PER_IP);
    await this.limit(this.reads, `invite-page:${hash.toString('hex')}`, PAGE_PER_TOKEN);
    const ctx = await this.guest(token, req);
    await runAction(this.runtime, ctx, recordInvitationOpened, {});
    return this.page(ctx);
  }

  /** Attending or not, and how many, per scope; returns the page with the new answers. */
  @Post('rsvp')
  @HttpCode(200)
  @RequireIdempotencyKey()
  @ZodResponse({ type: PublicInviteDto })
  async rsvp(@Param('token') token: string, @Body() body: RsvpDto, @Req() req: Request) {
    await this.limit(this.writes, `rsvp:${hashLinkToken(token).toString('hex')}`, RSVP_PER_TOKEN);
    const ctx = await this.guest(token, req);
    await runAction(this.runtime, ctx, respondToInvitation, body);
    return this.page(ctx);
  }

  private async limit(limiter: RateLimiter, key: string, rule: RateLimitRule) {
    const result = await limiter.consume(key, rule);
    if (!result.allowed) {
      throw new ActionError('rate_limited', 'Too many requests, try again shortly', {
        retryAfter: result.retryAfter,
      });
    }
  }

  /** The guest's action context, from their link. */
  private async guest(token: string, req: Request): Promise<ActionContext> {
    const found = await this.queries.lookupInvite(hashLinkToken(token));
    if (!found) throw new ActionError('not_found', 'This invitation link is not valid');
    if (found.kind === 'withdrawn') {
      throw new ActionError('link_revoked', 'This invitation was withdrawn');
    }
    return {
      requestId: (req as Request & { id?: string }).id ?? 'public',
      channel: 'public_link',
      actor: { kind: 'guest', invitationId: found.invitationId },
      eventId: found.eventId,
      now: new Date(),
    };
  }

  private async page(ctx: ActionContext) {
    const invitationId = ctx.actor.kind === 'guest' ? ctx.actor.invitationId : '';
    const page = await this.queries.invitePage(ctx.eventId!, invitationId);
    if (!page) throw new ActionError('link_revoked', 'This invitation was withdrawn');
    return page;
  }
}
