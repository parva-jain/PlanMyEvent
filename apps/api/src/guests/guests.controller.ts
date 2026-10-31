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
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ActionError,
  createContact,
  createHousehold,
  deleteContact,
  deleteHousehold,
  runAction,
  startContactImport,
  updateContact,
  updateHousehold,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import { newId, type GuestQueries } from '@pme/db';
import type { Response } from 'express';
import { ZodResponse } from 'nestjs-zod';

import type { RateLimiter } from '../auth/rate-limit';
import { ACTION_RUNTIME } from '../database/database.module';
import { EventContext, EventRoute } from '../events/event-access';
import { RequireIdempotencyKey } from '../http/idempotency.interceptor';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import { JobStatuses } from '../jobs/job-statuses';
import {
  ContactDto,
  ContactQueryDto,
  ContactsDto,
  CreateContactDto,
  CreateHouseholdDto,
  HouseholdDto,
  HouseholdQueryDto,
  HouseholdsDto,
  JobAcceptedDto,
  StartContactImportDto,
  UpdateContactDto,
  UpdateHouseholdDto,
} from './guests.dto';
import { GUEST_QUERIES, IMPORT_RATE_LIMITER } from './guests.tokens';

/** APIDesign "Rate limits": bulk and import calls, 10 per hour per event. */
const IMPORTS_PER_HOUR = { window: 60 * 60, max: 10 };

/**
 * Contacts and households (APIDesign "Guests and attendance"). They belong to the whole
 * event, so guests.view and guests.edit count only as whole-event grants.
 */
@ApiTags('guests')
@Controller('events/:eventId')
export class GuestsController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(GUEST_QUERIES) private readonly queries: GuestQueries,
    @Inject(IMPORT_RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly jobs: JobStatuses,
  ) {}

  // ---- Households ------------------------------------------------------------------------

  /** ?q searches the name. */
  @Get('households')
  @EventRoute('guests.view')
  @ZodResponse({ type: HouseholdsDto })
  households(@Param('eventId', UuidPipe) eventId: string, @Query() query: HouseholdQueryDto) {
    return this.queries.listHouseholds(eventId, query);
  }

  @Post('households')
  @EventRoute('guests.edit')
  @ZodResponse({ status: 201, type: HouseholdDto })
  createHousehold(@EventContext() ctx: ActionContext, @Body() body: CreateHouseholdDto) {
    return runAction(this.runtime, ctx, createHousehold, body);
  }

  @Get('households/:householdId')
  @EventRoute('guests.view')
  @ZodResponse({ type: HouseholdDto })
  async household(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('householdId', UuidPipe) householdId: string,
  ) {
    const household = await this.queries.getHousehold(eventId, householdId);
    if (!household) throw new ActionError('not_found', 'Household not found');
    return household;
  }

  @Patch('households/:householdId')
  @EventRoute('guests.edit')
  @ZodResponse({ type: HouseholdDto })
  updateHousehold(
    @EventContext() ctx: ActionContext,
    @Param('householdId', UuidPipe) householdId: string,
    @IfMatch() version: number,
    @Body() body: UpdateHouseholdDto,
  ) {
    return runAction(this.runtime, ctx, updateHousehold, {
      householdId,
      expectedVersion: version,
      changes: body,
    });
  }

  /** Its contacts stay, outside any household. */
  @Delete('households/:householdId')
  @EventRoute('guests.edit')
  @HttpCode(204)
  async deleteHousehold(
    @EventContext() ctx: ActionContext,
    @Param('householdId', UuidPipe) householdId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteHousehold, { householdId, expectedVersion: version });
  }

  // ---- Contacts --------------------------------------------------------------------------

  /** ?q searches name, email and phone; ?tag and ?householdId filter. */
  @Get('contacts')
  @EventRoute('guests.view')
  @ZodResponse({ type: ContactsDto })
  contacts(@Param('eventId', UuidPipe) eventId: string, @Query() query: ContactQueryDto) {
    return this.queries.listContacts(eventId, query);
  }

  @Post('contacts')
  @EventRoute('guests.edit')
  @ZodResponse({ status: 201, type: ContactDto })
  createContact(@EventContext() ctx: ActionContext, @Body() body: CreateContactDto) {
    return runAction(this.runtime, ctx, createContact, body);
  }

  /**
   * CSV import (APIDesign "Async jobs"): the file and mapping are checked now (422 names the
   * problem), the rows are imported by the worker. Follow the job on the socket's
   * job.progress, or at the Location URL.
   */
  @Post('contacts/import')
  @HttpCode(202)
  @EventRoute('guests.edit')
  @RequireIdempotencyKey()
  @ZodResponse({ status: 202, type: JobAcceptedDto })
  async importContacts(
    @EventContext() ctx: ActionContext,
    @Body() body: StartContactImportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const limit = await this.limiter.consume(`imports:${ctx.eventId}`, IMPORTS_PER_HOUR);
    if (!limit.allowed) {
      throw new ActionError('rate_limited', 'This event has had 10 imports in the last hour', {
        retryAfter: limit.retryAfter,
      });
    }
    const { jobId, total } = await runAction(this.runtime, ctx, startContactImport, {
      ...body,
      importId: newId(),
    });
    await this.jobs.queued({
      jobId,
      kind: 'contacts.import',
      eventId: ctx.eventId!,
      userId: ctx.actor.kind === 'user' ? ctx.actor.userId : '',
      progress: { done: 0, total },
    });
    const statusUrl = `/v1/jobs/${jobId}`;
    res.setHeader('Location', statusUrl);
    return { jobId, status: 'queued' as const, statusUrl };
  }

  @Get('contacts/:contactId')
  @EventRoute('guests.view')
  @ZodResponse({ type: ContactDto })
  async contact(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('contactId', UuidPipe) contactId: string,
  ) {
    const contact = await this.queries.getContact(eventId, contactId);
    if (!contact) throw new ActionError('not_found', 'Contact not found');
    return contact;
  }

  @Patch('contacts/:contactId')
  @EventRoute('guests.edit')
  @ZodResponse({ type: ContactDto })
  updateContact(
    @EventContext() ctx: ActionContext,
    @Param('contactId', UuidPipe) contactId: string,
    @IfMatch() version: number,
    @Body() body: UpdateContactDto,
  ) {
    return runAction(this.runtime, ctx, updateContact, {
      contactId,
      expectedVersion: version,
      changes: body,
    });
  }

  @Delete('contacts/:contactId')
  @EventRoute('guests.edit')
  @HttpCode(204)
  async deleteContact(
    @EventContext() ctx: ActionContext,
    @Param('contactId', UuidPipe) contactId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteContact, { contactId, expectedVersion: version });
  }
}
