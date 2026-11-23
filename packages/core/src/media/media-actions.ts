import {
  IMAGE_TYPES,
  jobId,
  type CreateUpload,
  type MediaJob,
  type UpdateMedia,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import { ActionError } from '../errors.js';
import { liveSignals } from '../live.js';
import type { CoreTx, MediaOutcome, MediaRow } from '../ports.js';

/*
 * Photos and receipts (SystemDesign 5.7). The API hands out a presigned PUT for the row these
 * actions make; the browser uploads straight to storage; confirming queues the worker, whose
 * outcome comes back through finishMediaProcessing.
 */

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
};

const findMedia = async (tx: CoreTx, eventId: string, mediaId: string) => {
  const row = await tx.media.find(eventId, mediaId);
  if (!row) throw new ActionError('not_found', 'File not found');
  return row;
};

function uploadAction(
  kind: 'gallery' | 'receipt',
  permission: 'gallery.upload' | 'budget.edit',
): ActionDefinition<CreateUpload, MediaRow, CoreTx> {
  return {
    name: `media.upload_${kind}`,
    permission,
    subEventOf: (_tx, _ctx, input) => input.subEventId ?? null,
    noActivity: 'An upload ticket; the file is logged once the upload is confirmed',
    async execute(tx, ctx, input) {
      if (ctx.actor.kind !== 'user') throw new ActionError('forbidden', 'Sign in to upload');
      if (input.kind !== kind) throw fieldError('kind', `Expected a ${kind} upload`);
      if (kind === 'gallery' && !(IMAGE_TYPES as readonly string[]).includes(input.mime)) {
        throw new ActionError('unsupported_media_type', 'Gallery uploads are photos');
      }
      const eventId = ctx.eventId!;
      if (input.subEventId && !(await tx.subEvents.find(eventId, input.subEventId))) {
        throw fieldError('subEventId', 'Sub-event not found in this event');
      }
      const row = await tx.media.insert(eventId, {
        kind,
        // Receipts are never public (DatabaseDesign "media").
        bucket: kind === 'receipt' ? 'private' : 'public',
        extension: EXTENSIONS[input.mime] ?? '',
        mime: input.mime,
        bytes: input.bytes,
        subEventId: input.subEventId ?? null,
        caption: input.caption ?? null,
        uploadedByUserId: ctx.actor.userId,
      });
      return { result: row };
    },
  };
}

/** POST E/uploads { kind: 'gallery' }: gallery.upload in the album's sub-event. */
export const createGalleryUpload = uploadAction('gallery', 'gallery.upload');
/** POST E/uploads { kind: 'receipt' }: budget.edit in the expense's sub-event. */
export const createReceiptUpload = uploadAction('receipt', 'budget.edit');

/**
 * POST E/media/{id}/complete: the uploader says the file is there (the API checked storage).
 * Logs the new file and queues the worker; a second call changes nothing.
 */
export const completeUpload: ActionDefinition<{ mediaId: string }, MediaRow, CoreTx> = {
  name: 'media.complete',
  permission: null,
  async execute(tx, ctx, { mediaId }) {
    const eventId = ctx.eventId!;
    const before = await findMedia(tx, eventId, mediaId);
    if (ctx.actor.kind !== 'user' || before.uploadedByUserId !== ctx.actor.userId) {
      throw new ActionError('forbidden', 'Only the uploader can confirm this upload');
    }
    const after = await tx.media.markUploaded(eventId, mediaId, ctx.now);
    if (!after) return { result: before, activity: [] };
    const job: MediaJob = { mediaId, eventId };
    return {
      result: after,
      activity: [{ action: 'upload', entityType: 'media', entityId: mediaId, before: null, after }],
      outbox: [{ topic: 'media.process', dedupeKey: jobId('media', mediaId), payload: job }],
    };
  },
};

/**
 * The worker's result: ready with its versions, or failed (not a real image or PDF, too big).
 * Not logged (the upload was); open screens hear about it through entity.changed.
 */
export const finishMediaProcessing: ActionDefinition<
  { mediaId: string; outcome: MediaOutcome },
  MediaRow | null,
  CoreTx
> = {
  name: 'media.finish',
  permission: null,
  noActivity: 'Processing is the system finishing an upload already logged',
  async execute(tx, ctx, { mediaId, outcome }) {
    if (ctx.actor.kind !== 'system') {
      throw new ActionError('forbidden', 'Only the worker finishes uploads');
    }
    const after = await tx.media.finish(ctx.eventId!, mediaId, outcome);
    if (!after) return { result: null };
    const outbox = liveSignals(ctx, [
      { action: 'process', entityType: 'media', entityId: mediaId, before: null, after },
    ]);
    return { result: after, outbox };
  },
};

/** PATCH E/media/{id}: caption and album, gallery.manage. */
export const updateMedia: ActionDefinition<
  { mediaId: string; expectedVersion: number; changes: UpdateMedia },
  MediaRow,
  CoreTx
> = {
  name: 'media.update',
  permission: 'gallery.manage',
  async subEventOf(tx, ctx, input) {
    return (await tx.media.find(ctx.eventId!, input.mediaId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { mediaId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await findMedia(tx, eventId, mediaId);
    if (before.kind !== 'gallery') throw new ActionError('not_found', 'Photo not found');
    if (changes.subEventId && !(await tx.subEvents.find(eventId, changes.subEventId))) {
      throw fieldError('subEventId', 'Sub-event not found in this event');
    }
    const after = await tx.media.update(eventId, mediaId, expectedVersion, changes);
    if (!after) {
      throw new ActionError('version_conflict', 'This photo was changed by someone else', {
        current: await tx.media.find(eventId, mediaId),
      });
    }
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'media', entityId: mediaId, before, after }],
    };
  },
};

/**
 * DELETE E/media/{id}: a gallery photo, gallery.manage. The row is soft-deleted at once; the
 * files go from storage 30 days later (scheduled cleanup).
 */
export const deleteMedia: ActionDefinition<
  { mediaId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'media.delete',
  permission: 'gallery.manage',
  async subEventOf(tx, ctx, input) {
    return (await tx.media.find(ctx.eventId!, input.mediaId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { mediaId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findMedia(tx, eventId, mediaId);
    if (before.kind !== 'gallery') throw new ActionError('not_found', 'Photo not found');
    if (!(await tx.media.softDelete(eventId, mediaId, expectedVersion))) {
      throw new ActionError('version_conflict', 'This photo was changed by someone else', {
        current: await tx.media.find(eventId, mediaId),
      });
    }
    return {
      result: undefined,
      activity: [{ action: 'delete', entityType: 'media', entityId: mediaId, before, after: null }],
    };
  },
};
