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
import { subEventsWith, type Invitation } from '@pme/contracts';
import {
  ActionError,
  createInvitation,
  createInvitations,
  deleteInvitation,
  regenerateInvitationLink,
  runAction,
  updateAttendance,
  updateInvitation,
  updateInvitations,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import { invitationToken, type InvitationQueries, type InvitationVisibility } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';
import { ACTION_RUNTIME } from '../database/database.module';
import { EventAccess, EventContext, EventRoute } from '../events/event-access';
import { RequireIdempotencyKey } from '../http/idempotency.interceptor';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import { INVITATION_QUERIES } from './guests.tokens';
import {
  AttendanceDto,
  AttendanceListDto,
  AttendanceQueryDto,
  BulkCreateInvitationsDto,
  BulkCreateInvitationsResultDto,
  BulkUpdateInvitationsDto,
  BulkUpdateInvitationsResultDto,
  CreateInvitationDto,
  InvitationDto,
  InvitationQueryDto,
  InvitationsDto,
  InvitationShareDto,
  UpdateAttendanceDto,
  UpdateInvitationDto,
} from './invitations.dto';

/**
 * Whole-event guests.view sees every invitation; guests.view scoped to sub-events sees the
 * ones covering them; anyone else, the cards they hand over.
 */
function visibilityOf(access: MemberAccess): InvitationVisibility {
  const scope = subEventsWith(access, 'guests.view');
  if (scope === 'all') return { kind: 'all' };
  if (scope.size) return { kind: 'subEvents', subEventIds: scope };
  return { kind: 'distributor', memberId: access.memberId };
}

function canSee(access: MemberAccess, invitation: Invitation) {
  const visible = visibilityOf(access);
  if (visible.kind === 'all') return true;
  if (visible.kind === 'distributor') return invitation.distributorMemberId === visible.memberId;
  return invitation.subEventIds.some((id) => visible.subEventIds.has(id));
}

/** Invitations and attendance (APIDesign "Guests and attendance"). */
@ApiTags('guests')
@Controller('events/:eventId')
export class InvitationsController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(INVITATION_QUERIES) private readonly queries: InvitationQueries,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  // ---- Invitations -----------------------------------------------------------------------

  /** Filters deliveryStatus, distributor (a member id or "me") and subEventId. */
  @Get('invitations')
  @EventRoute(null)
  @ZodResponse({ type: InvitationsDto })
  invitations(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: InvitationQueryDto,
    @EventAccess() access: MemberAccess,
  ) {
    const distributor = query.distributor === 'me' ? access.memberId : query.distributor;
    return this.queries.list(eventId, { ...query, distributor }, visibilityOf(access));
  }

  @Post('invitations')
  @EventRoute('guests.invite')
  @ZodResponse({ status: 201, type: InvitationDto })
  create(@EventContext() ctx: ActionContext, @Body() body: CreateInvitationDto) {
    return runAction(this.runtime, ctx, createInvitation, body);
  }

  /** Up to 200 guests; ones already invited (or through their household) are listed as skipped. */
  @Post('invitations/bulk')
  @EventRoute('guests.invite')
  @RequireIdempotencyKey()
  @ZodResponse({ status: 201, type: BulkCreateInvitationsResultDto })
  createMany(@EventContext() ctx: ActionContext, @Body() body: BulkCreateInvitationsDto) {
    return runAction(this.runtime, ctx, createInvitations, body);
  }

  /** One delivery status or distributor for many invitations at once. */
  @Patch('invitations/bulk')
  @EventRoute('guests.invite')
  @ZodResponse({ type: BulkUpdateInvitationsResultDto })
  updateMany(@EventContext() ctx: ActionContext, @Body() body: BulkUpdateInvitationsDto) {
    return runAction(this.runtime, ctx, updateInvitations, body);
  }

  @Get('invitations/:invitationId')
  @EventRoute(null)
  @ZodResponse({ type: InvitationDto })
  async invitation(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('invitationId', UuidPipe) invitationId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const invitation = await this.queries.get(eventId, invitationId);
    if (!invitation) throw new ActionError('not_found', 'Invitation not found');
    if (!canSee(access, invitation)) {
      throw new ActionError('forbidden', 'You need the guests.view permission', {
        permission: 'guests.view',
      });
    }
    return invitation;
  }

  /** guests.invite, or the card's distributor changing its delivery status (decided in core). */
  @Patch('invitations/:invitationId')
  @EventRoute(null)
  @ZodResponse({ type: InvitationDto })
  update(
    @EventContext() ctx: ActionContext,
    @Param('invitationId', UuidPipe) invitationId: string,
    @IfMatch() version: number,
    @Body() body: UpdateInvitationDto,
  ) {
    return runAction(this.runtime, ctx, updateInvitation, {
      invitationId,
      expectedVersion: version,
      changes: body,
    });
  }

  /** Withdraws it: the link stops working and the guest's attendance is cancelled. */
  @Delete('invitations/:invitationId')
  @EventRoute('guests.invite')
  @HttpCode(204)
  async withdraw(
    @EventContext() ctx: ActionContext,
    @Param('invitationId', UuidPipe) invitationId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteInvitation, {
      invitationId,
      expectedVersion: version,
    });
  }

  /**
   * The magic link and a ready WhatsApp message to forward (to the guest's phone when known).
   * The link is derived again each time, never stored.
   */
  @Get('invitations/:invitationId/share')
  @EventRoute('guests.invite')
  @ZodResponse({ type: InvitationShareDto })
  async share(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('invitationId', UuidPipe) invitationId: string,
  ) {
    const info = await this.queries.shareInfo(eventId, invitationId);
    if (!info) throw new ActionError('not_found', 'Invitation not found');
    const token = invitationToken(this.env.INVITATION_LINK_KEY, invitationId, info.tokenVersion);
    const url = `${this.env.WEB_ORIGIN}/i/${token}`;
    const message = `${info.guestName}, you're invited to ${info.eventName}! See your invitation here: ${url}`;
    const to = info.phone ? info.phone.replace(/\D/g, '') : '';
    return { url, message, whatsappUrl: `https://wa.me/${to}?text=${encodeURIComponent(message)}` };
  }

  /** A new link; the old one stops working. */
  @Post('invitations/:invitationId/regenerate-link')
  @EventRoute('guests.invite')
  @HttpCode(200)
  @ZodResponse({ type: InvitationDto })
  regenerate(
    @EventContext() ctx: ActionContext,
    @Param('invitationId', UuidPipe) invitationId: string,
    @IfMatch() version: number,
  ) {
    return runAction(this.runtime, ctx, regenerateInvitationLink, {
      invitationId,
      expectedVersion: version,
    });
  }

  // ---- Attendance ------------------------------------------------------------------------

  /** Filters subEventId ("event" for the whole event), status, source and q (guest name). */
  @Get('attendance')
  @EventRoute('guests.view', 'list')
  @ZodResponse({ type: AttendanceListDto })
  attendance(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: AttendanceQueryDto,
    @EventAccess() access: MemberAccess,
  ) {
    return this.queries.listAttendance(eventId, query, subEventsWith(access, 'guests.view'));
  }

  @Patch('attendance/:attendanceId')
  @EventRoute('guests.edit', 'list')
  @ZodResponse({ type: AttendanceDto })
  updateAttendance(
    @EventContext() ctx: ActionContext,
    @Param('attendanceId', UuidPipe) attendanceId: string,
    @IfMatch() version: number,
    @Body() body: UpdateAttendanceDto,
  ) {
    return runAction(this.runtime, ctx, updateAttendance, {
      attendanceId,
      expectedVersion: version,
      changes: body,
    });
  }
}
