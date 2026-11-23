import { Body, Controller, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PublicEventSchema, RegisterSchema, RegistrationResultSchema } from '@pme/contracts';
import {
  ActionError,
  registerForEvent,
  runAction,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import { publicEventPage, type Database } from '@pme/db';
import type { Request, Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../auth/public.decorator';
import type { RateLimiter, RateLimitRule } from '../auth/rate-limit';
import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { ACTION_RUNTIME, DB } from '../database/database.module';
import { RequireIdempotencyKey } from '../http/idempotency.interceptor';
import { PUBLIC_READ_LIMITER, PUBLIC_WRITE_LIMITER } from './public.tokens';
import { TURNSTILE_VERIFIER, type TurnstileVerifier } from './turnstile';

export class PublicEventDto extends createZodDto(PublicEventSchema) {}
export class RegisterDto extends createZodDto(RegisterSchema) {}
export class RegistrationResultDto extends createZodDto(RegistrationResultSchema) {}

/** APIDesign "Rate limits": the public event page and registrations. */
const PAGE_PER_IP: RateLimitRule = { window: 60, max: 120 };
const REGISTER_PER_IP: RateLimitRule = { window: 60, max: 5 };

/**
 * An event's public page and open registration (APIDesign "Public endpoints"): no account, no
 * session. Registrations run as a visitor (actor kind 'visitor', channel public_link) after the
 * per-IP limit and Cloudflare Turnstile; everything else is the core action's.
 */
@ApiTags('public')
@Public()
@Controller('public/events/:slug')
export class PublicEventsController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(DB) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(PUBLIC_READ_LIMITER) private readonly reads: RateLimiter,
    @Inject(PUBLIC_WRITE_LIMITER) private readonly writes: RateLimiter,
    @Inject(TURNSTILE_VERIFIER) private readonly turnstile: TurnstileVerifier,
  ) {}

  /** 404 for draft, archived or unknown events, and for events with nothing public. */
  @Get()
  @ZodResponse({ type: PublicEventDto })
  async page(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limit(this.reads, `event-page:${req.ip}`, PAGE_PER_IP);
    const found = await publicEventPage(this.db, slug.toLowerCase());
    if (!found) throw new ActionError('not_found', 'Event not found');
    // A CDN in front may keep it a minute (APIDesign: CDN cached 60 s).
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return found.page;
  }

  /**
   * Registers for the chosen sub-events (or the whole event). The same answer for someone
   * already registered; capacity_full when a sub-event has no room; captcha_failed when
   * Turnstile says it wasn't a person.
   */
  @Post('registrations')
  @RequireIdempotencyKey()
  @ZodResponse({ status: 201, type: RegistrationResultDto })
  async register(@Param('slug') slug: string, @Body() body: RegisterDto, @Req() req: Request) {
    await this.limit(this.writes, `register:${req.ip}`, REGISTER_PER_IP);
    let human: boolean;
    try {
      human = await this.turnstile.verify(body.turnstileToken, req.ip);
    } catch {
      throw new ActionError('service_unavailable', 'Couldn’t check the form; try again shortly');
    }
    if (!human) throw new ActionError('captcha_failed', 'Please complete the check and try again');

    const found = await publicEventPage(this.db, slug.toLowerCase());
    if (!found) throw new ActionError('not_found', 'Event not found');
    const { turnstileToken: _token, ...input } = body;
    return runAction(
      this.runtime,
      {
        requestId: (req as Request & { id?: string }).id ?? 'public',
        channel: 'public_link',
        actor: { kind: 'visitor', name: input.name },
        eventId: found.eventId,
        now: new Date(),
      },
      registerForEvent,
      { ...input, linkBase: `${this.env.WEB_ORIGIN}/i/` },
    );
  }

  private async limit(limiter: RateLimiter, key: string, rule: RateLimitRule) {
    const result = await limiter.consume(key, rule);
    if (!result.allowed) {
      throw new ActionError('rate_limited', 'Too many requests, try again shortly', {
        retryAfter: result.retryAfter,
      });
    }
  }
}
