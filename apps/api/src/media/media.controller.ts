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
import { can, MAX_UPLOAD_BYTES } from '@pme/contracts';
import {
  ActionError,
  completeUpload,
  createGalleryUpload,
  createReceiptUpload,
  deleteMedia,
  runAction,
  updateMedia,
  type ActionContext,
  type ActionRuntime,
  type CoreTx,
  type MemberAccess,
} from '@pme/core';
import type { MediaQueries } from '@pme/db';
import { ZodResponse } from 'nestjs-zod';

import { ACTION_RUNTIME } from '../database/database.module';
import { EventAccess, EventContext, EventRoute } from '../events/event-access';
import { IfMatch } from '../http/if-match';
import { UuidPipe } from '../http/uuid.pipe';
import {
  CreateUploadDto,
  MediaDto,
  MediaPageDto,
  MediaQueryDto,
  MediaUrlDto,
  UpdateMediaDto,
  UploadTicketDto,
} from './media.dto';
import { MEDIA_STORAGE, type MediaStorage } from './storage';

export const MEDIA_QUERIES = Symbol('MEDIA_QUERIES');

/**
 * Photos and receipts (APIDesign "Platform", SystemDesign 5.7). Uploads go from the browser
 * straight to storage with a presigned PUT; this controller signs, confirms and lists. The
 * permission for an upload depends on its kind, so the core action checks it.
 */
@ApiTags('media')
@Controller('events/:eventId')
export class MediaController {
  constructor(
    @Inject(ACTION_RUNTIME) private readonly runtime: ActionRuntime<CoreTx>,
    @Inject(MEDIA_QUERIES) private readonly queries: MediaQueries,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  /** A presigned PUT, valid 10 minutes: gallery.upload for photos, budget.edit for receipts. */
  @Post('uploads')
  @EventRoute(null)
  @ZodResponse({ status: 201, type: UploadTicketDto })
  async upload(@EventContext() ctx: ActionContext, @Body() body: CreateUploadDto) {
    const action = body.kind === 'receipt' ? createReceiptUpload : createGalleryUpload;
    const row = await runAction(this.runtime, ctx, action, body);
    const ticket = await this.storage.uploadUrl(row.bucket, row.storageKey, row.mime);
    return {
      mediaId: row.id,
      uploadUrl: ticket.url,
      headers: ticket.headers,
      expiresAt: ticket.expiresAt.toISOString(),
    };
  }

  /** The uploader confirms; processing starts. 409 when the file isn't in storage yet. */
  @Post('media/:mediaId/complete')
  @EventRoute(null)
  @HttpCode(200)
  @ZodResponse({ type: MediaDto })
  async complete(@EventContext() ctx: ActionContext, @Param('mediaId', UuidPipe) mediaId: string) {
    const eventId = ctx.eventId!;
    const stored = await this.queries.upload(eventId, mediaId);
    if (!stored) throw new ActionError('not_found', 'File not found');
    const size = await this.storage.size(stored.bucket, stored.key);
    if (size === null) {
      throw new ActionError('conflict', 'The file hasn’t arrived yet; upload it first', {
        reason: 'not_uploaded',
      });
    }
    if (size > MAX_UPLOAD_BYTES) {
      throw new ActionError('payload_too_large', 'Files can be up to 15 MB');
    }
    await runAction(this.runtime, ctx, completeUpload, { mediaId });
    return this.found(eventId, mediaId);
  }

  /** The gallery (event.view), or receipts (budget.view), newest first. */
  @Get('media')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: MediaPageDto })
  list(
    @Param('eventId', UuidPipe) eventId: string,
    @Query() query: MediaQueryDto,
    @EventContext() ctx: ActionContext,
    @EventAccess() access: MemberAccess,
  ) {
    // Receipts listed only for the whole event: a scoped budget viewer reaches each receipt
    // through its expense instead.
    if (query.kind === 'receipt' && !can(access, 'budget.view')) {
      throw new ActionError('forbidden', 'You need the budget.view permission', {
        permission: 'budget.view',
      });
    }
    const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : '';
    return this.queries.list(eventId, query, userId);
  }

  @Get('media/:mediaId')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: MediaDto })
  async one(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('mediaId', UuidPipe) mediaId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const media = await this.found(eventId, mediaId);
    // A receipt is the budget's: budget.view where it belongs, else it doesn't exist for you.
    if (media.kind === 'receipt' && !can(access, 'budget.view', media.subEventId)) {
      throw new ActionError('not_found', 'File not found');
    }
    return media;
  }

  /** A link valid 5 minutes; receipts need budget.view where the receipt's expense is. */
  @Get('media/:mediaId/url')
  @EventRoute('event.view', 'list')
  @ZodResponse({ type: MediaUrlDto })
  async url(
    @Param('eventId', UuidPipe) eventId: string,
    @Param('mediaId', UuidPipe) mediaId: string,
    @EventAccess() access: MemberAccess,
  ) {
    const file = await this.queries.privateFile(eventId, mediaId);
    if (!file) throw new ActionError('not_found', 'File not found');
    if (file.kind === 'receipt' && !can(access, 'budget.view', file.subEventId)) {
      throw new ActionError('forbidden', 'You need the budget.view permission', {
        permission: 'budget.view',
      });
    }
    const signed = await this.storage.viewUrl(file.bucket, file.key);
    return { url: signed.url, mime: file.mime, expiresAt: signed.expiresAt.toISOString() };
  }

  @Patch('media/:mediaId')
  @EventRoute('gallery.manage', 'list')
  @ZodResponse({ type: MediaDto })
  async update(
    @EventContext() ctx: ActionContext,
    @Param('mediaId', UuidPipe) mediaId: string,
    @IfMatch() version: number,
    @Body() body: UpdateMediaDto,
  ) {
    await runAction(this.runtime, ctx, updateMedia, {
      mediaId,
      expectedVersion: version,
      changes: body,
    });
    return this.found(ctx.eventId!, mediaId);
  }

  @Delete('media/:mediaId')
  @EventRoute('gallery.manage', 'list')
  @HttpCode(204)
  async remove(
    @EventContext() ctx: ActionContext,
    @Param('mediaId', UuidPipe) mediaId: string,
    @IfMatch() version: number,
  ) {
    await runAction(this.runtime, ctx, deleteMedia, { mediaId, expectedVersion: version });
  }

  private async found(eventId: string, mediaId: string) {
    const media = await this.queries.get(eventId, mediaId);
    if (!media) throw new ActionError('not_found', 'File not found');
    return media;
  }
}
