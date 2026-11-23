import type { Media, MediaPage, MediaQuery } from '@pme/contracts';
import { and, desc, eq, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { users } from '../schema/auth.js';
import { media } from '../schema/media.js';
import { decodeCursor, encodeCursor } from './cursor.js';

type Row = typeof media.$inferSelect;

/**
 * Media reads for the API. Gallery photos link to the public bucket through `publicBaseUrl`
 * (the CDN in production, SeaweedFS locally); receipts never get a public link.
 */
export function mediaQueries(db: Database, publicBaseUrl: string) {
  const base = publicBaseUrl.replace(/\/$/, '');
  const toMedia = (row: Row, uploadedBy: string | null): Media => {
    const variants = row.variants as Record<string, string>;
    const linked = row.bucket === 'public' && row.status === 'ready' && variants.thumb;
    return {
      id: row.id,
      kind: row.kind as Media['kind'],
      status: row.status as Media['status'],
      mime: row.mime,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      subEventId: row.subEventId,
      caption: row.caption,
      uploadedByUserId: row.uploadedByUserId,
      uploadedBy,
      urls: linked
        ? { thumb: `${base}/${variants.thumb}`, display: `${base}/${variants.display}` }
        : null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  };
  const named = (row: { media: Row; name: string | null; email: string | null }) =>
    toMedia(row.media, row.name?.trim() || row.email?.split('@')[0] || null);
  const select = () =>
    db
      .select({ media, name: users.name, email: users.email })
      .from(media)
      .leftJoin(users, eq(users.id, media.uploadedByUserId));

  return {
    async get(eventId: string, mediaId: string): Promise<Media | null> {
      const [row] = await select().where(
        and(eq(media.eventId, eventId), eq(media.id, mediaId), isNull(media.deletedAt)),
      );
      return row ? named(row) : null;
    },

    /**
     * GET E/media: ready files newest first (UUIDv7 ids sort by time), plus my own uploads
     * still processing or failed, so I see them arrive. Cursor-paginated by id.
     */
    async list(eventId: string, query: MediaQuery, userId: string): Promise<MediaPage> {
      const filters: (SQL | undefined)[] = [
        eq(media.eventId, eventId),
        eq(media.kind, query.kind),
        isNull(media.deletedAt),
        or(
          eq(media.status, 'ready'),
          and(eq(media.uploadedByUserId, userId), isNotNull(media.uploadedAt)),
        ),
      ];
      if (query.subEventId === 'event') filters.push(isNull(media.subEventId));
      else if (query.subEventId) filters.push(eq(media.subEventId, query.subEventId));
      if (query.cursor) filters.push(lt(media.id, decodeCursor(query.cursor)));
      const rows = await select()
        .where(and(...filters))
        .orderBy(desc(media.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: page.map(named),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.media.id) : null,
        hasMore,
      };
    },

    /** Where an upload goes, to check it arrived before confirming it. */
    async upload(eventId: string, mediaId: string) {
      const [row] = await db
        .select({ bucket: media.bucket, storageKey: media.storageKey })
        .from(media)
        .where(and(eq(media.eventId, eventId), eq(media.id, mediaId), isNull(media.deletedAt)));
      return row ? { bucket: row.bucket as 'public' | 'private', key: row.storageKey } : null;
    },

    /** Where a private file is, for a short-lived signed URL: the large version, or the PDF. */
    async privateFile(eventId: string, mediaId: string) {
      const [row] = await db
        .select()
        .from(media)
        .where(and(eq(media.eventId, eventId), eq(media.id, mediaId), isNull(media.deletedAt)));
      if (!row || row.status !== 'ready') return null;
      const variants = row.variants as Record<string, string>;
      const key = variants.display ?? variants.file;
      if (!key) return null;
      return {
        bucket: row.bucket as 'public' | 'private',
        key,
        mime: variants.display ? 'image/webp' : row.mime,
        kind: row.kind,
        subEventId: row.subEventId,
      };
    },
  };
}

export type MediaQueries = ReturnType<typeof mediaQueries>;

/** The media worker's view of a row: where the upload is and whether it still waits. */
export async function mediaForProcessing(db: Database, eventId: string, mediaId: string) {
  const [row] = await db
    .select({
      id: media.id,
      kind: media.kind,
      bucket: media.bucket,
      storageKey: media.storageKey,
      status: media.status,
    })
    .from(media)
    .where(and(eq(media.eventId, eventId), eq(media.id, mediaId), isNull(media.deletedAt)));
  return row
    ? {
        ...row,
        kind: row.kind as 'gallery' | 'receipt' | 'cover',
        bucket: row.bucket as 'public' | 'private',
      }
    : null;
}
