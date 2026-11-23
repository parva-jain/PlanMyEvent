import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { id, timestamps } from './columns.js';
import { events, subEvents } from './events.js';

/**
 * Photos and receipts (DatabaseDesign "media"). The row is made when the upload URL is handed
 * out (status pending, uploaded_at null); confirming the upload sets uploaded_at and queues
 * the worker, which sets ready or failed. Rows never confirmed are cleaned up after a day.
 */
export const media = pgTable(
  'media',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    kind: text().notNull(),
    status: text().notNull().default('pending'),
    /** Receipts are always private; gallery photos public behind the CDN. */
    bucket: text().notNull(),
    storageKey: text().notNull().unique(),
    /** Declared at upload; replaced by the type the worker found. */
    mime: text().notNull(),
    bytes: bigint({ mode: 'number' }).notNull(),
    width: integer(),
    height: integer(),
    /** Storage keys of the versions: { thumb, display } (WebP), or { file } for a PDF. */
    variants: jsonb().notNull().default({}),
    subEventId: uuid(),
    caption: text(),
    uploadedByUserId: uuid().references(() => users.id),
    /** Set when the uploader confirms the file is there. */
    uploadedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('media_event_id_id_unique').on(t.eventId, t.id),
    index('media_event_kind_created_idx')
      .on(t.eventId, t.kind, t.createdAt.desc())
      .where(sql`${t.status} = 'ready' and ${t.deletedAt} is null`),
    // Cleanup scans: unconfirmed uploads, and deleted files to remove from storage.
    index('media_unconfirmed_idx')
      .on(t.createdAt)
      .where(sql`${t.uploadedAt} is null`),
    index('media_deleted_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} is not null`),
    foreignKey({
      name: 'media_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }),
    valueSetCheck('media_kind_check', t.kind, 'mediaKind'),
    valueSetCheck('media_status_check', t.status, 'mediaStatus'),
    check('media_bucket_check', sql`${t.bucket} in ('public', 'private')`),
    check('media_receipt_private_check', sql`${t.kind} <> 'receipt' or ${t.bucket} = 'private'`),
    check('media_bytes_check', sql`${t.bytes} > 0`),
  ],
);
