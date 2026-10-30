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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ActionError,
  createContact,
  createHousehold,
  deleteContact,
  deleteHousehold,
  runAction,
  updateContact,
  updateHousehold,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
} from '@pme/core';
import type { GuestQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { ACTION_RUNTIME } from '../database/database.module';
import { EventContext, EventRoute } from '../events/event-access';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import {
  ContactDto,
  ContactQueryDto,
  ContactsDto,
  CreateContactDto,
  CreateHouseholdDto,
  HouseholdDto,
  HouseholdQueryDto,
  HouseholdsDto,
  UpdateContactDto,
  UpdateHouseholdDto,
} from './guests.dto';
import { GUEST_QUERIES } from './guests.tokens';

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
