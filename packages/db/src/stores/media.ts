import { mediaKey } from '@pme/contracts';
import type { MediaRow, MediaStore } from '@pme/core';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { media } from '../schema/media.js';
import { newId } from '../uuid.js';

type Queryable = Database | DrizzleTx;
type Row = typeof media.$inferSelect;

export const toMediaRow = (row: Row): MediaRow => ({
  id: row.id,
  kind: row.kind as MediaRow['kind'],
  status: row.status as MediaRow['status'],
  bucket: row.bucket as MediaRow['bucket'],
  storageKey: row.storageKey,
  mime: row.mime,
  bytes: row.bytes,
  width: row.width,
  height: row.height,
  variants: row.variants as Record<string, string>,
  subEventId: row.subEventId,
  caption: row.caption,
  uploadedByUserId: row.uploadedByUserId,
  uploadedAt: row.uploadedAt?.toISOString() ?? null,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
});

const live = (eventId: string, mediaId: string) =>
  and(eq(media.eventId, eventId), eq(media.id, mediaId), isNull(media.deletedAt));

const one = (rows: Row[]) => (rows[0] ? toMediaRow(rows[0]) : null);

/** DatabaseDesign "media": written by core's media actions. */
export function mediaStore(db: Queryable): MediaStore {
  return {
    async insert(eventId, input) {
      const id = newId();
      const { extension, ...rest } = input;
      const [row] = await db
        .insert(media)
        .values({
          ...rest,
          id,
          eventId,
          storageKey: mediaKey(eventId, input.kind, id, extension),
        })
        .returning();
      return toMediaRow(row!);
    },
    async find(eventId, mediaId) {
      return one(await db.select().from(media).where(live(eventId, mediaId)));
    },
    async markUploaded(eventId, mediaId, at) {
      return one(
        await db
          .update(media)
          .set({ uploadedAt: at, version: sql`${media.version} + 1` })
          .where(and(live(eventId, mediaId), isNull(media.uploadedAt)))
          .returning(),
      );
    },
    async finish(eventId, mediaId, outcome) {
      return one(
        await db
          .update(media)
          .set({ ...outcome, updatedAt: new Date(), version: sql`${media.version} + 1` })
          .where(and(live(eventId, mediaId), eq(media.status, 'pending')))
          .returning(),
      );
    },
    async update(eventId, mediaId, expectedVersion, changes) {
      return one(
        await db
          .update(media)
          .set({ ...changes, updatedAt: new Date(), version: sql`${media.version} + 1` })
          .where(and(live(eventId, mediaId), eq(media.version, expectedVersion)))
          .returning(),
      );
    },
    async softDelete(eventId, mediaId, expectedVersion) {
      const rows = await db
        .update(media)
        .set({ deletedAt: new Date(), version: sql`${media.version} + 1` })
        .where(and(live(eventId, mediaId), eq(media.version, expectedVersion)))
        .returning({ id: media.id });
      return rows.length > 0;
    },
  };
}
