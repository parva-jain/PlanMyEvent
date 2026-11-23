import { z } from 'zod';

import { MediaStatusSchema } from './enums.js';

/*
 * Media: gallery photos and expense receipts (APIDesign "Upload a receipt", SystemDesign 5.7,
 * DatabaseDesign "media"). Browsers upload straight to storage with a presigned PUT; the API
 * never sees the bytes. The worker checks the real type, writes WebP versions without the
 * camera's metadata (no location), and drops the original.
 */

/** Largest upload (APIDesign "payload_too_large": upload declared over 15 MB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Kinds this release uploads; `cover` (event cover photos) comes later. */
export const UploadKindSchema = z.enum(['gallery', 'receipt']);
export type UploadKind = z.infer<typeof UploadKindSchema>;

/** Photos for the gallery; receipts may also be PDFs. HEIC is what iPhones take. */
export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;
export const RECEIPT_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;
export const UploadMimeSchema = z.enum(RECEIPT_TYPES);
export type UploadMime = z.infer<typeof UploadMimeSchema>;

/** Width of the small and large WebP versions. */
export const MEDIA_SIZES = { thumb: 320, display: 1600 } as const;

/** POST E/uploads. */
export const CreateUploadSchema = z
  .object({
    kind: UploadKindSchema,
    mime: UploadMimeSchema,
    bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Files can be up to 15 MB'),
    /** Gallery album: the sub-event the photos are from; null for the whole event. */
    subEventId: z.uuid().nullable().optional(),
    caption: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.kind === 'receipt' || (IMAGE_TYPES as readonly string[]).includes(value.mime),
    { message: 'Gallery uploads are photos', path: ['mime'] },
  );
export type CreateUpload = z.infer<typeof CreateUploadSchema>;

/** Where and how to PUT the file: valid 10 minutes. */
export const UploadTicketSchema = z.object({
  mediaId: z.uuid(),
  uploadUrl: z.url(),
  /** Send exactly these headers with the PUT (they are part of the signature). */
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type UploadTicket = z.infer<typeof UploadTicketSchema>;

export const MediaSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['gallery', 'receipt', 'cover']),
  /** pending: uploaded or uploading, being processed; ready; failed (not a usable file). */
  status: MediaStatusSchema,
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  subEventId: z.uuid().nullable(),
  caption: z.string().nullable(),
  uploadedByUserId: z.uuid().nullable(),
  /** The uploader's name, for "Photo by …". */
  uploadedBy: z.string().nullable(),
  /**
   * Public links for gallery photos once ready; null for receipts (GET …/url gives a short-lived
   * one) and while processing.
   */
  urls: z.object({ thumb: z.url(), display: z.url() }).nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Media = z.infer<typeof MediaSchema>;

/** GET E/media: newest first. */
export const MediaQuerySchema = z.object({
  kind: z.enum(['gallery', 'receipt']).default('gallery'),
  /** An album: a sub-event's id, or 'event' for photos of the whole event. */
  subEventId: z.union([z.uuid(), z.literal('event')]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(48),
});
export type MediaQuery = z.infer<typeof MediaQuerySchema>;

export const MediaPageSchema = z.object({
  data: z.array(MediaSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type MediaPage = z.infer<typeof MediaPageSchema>;

/** PATCH E/media/{id} (If-Match): caption and album. */
export const UpdateMediaSchema = z
  .object({
    caption: z.string().trim().max(500).nullable(),
    subEventId: z.uuid().nullable(),
  })
  .partial()
  .strict();
export type UpdateMedia = z.infer<typeof UpdateMediaSchema>;

/** GET E/media/{id}/url: a private file (a receipt), valid 5 minutes. */
export const MediaUrlSchema = z.object({
  url: z.url(),
  /** The large version for photos; the PDF itself for PDF receipts. */
  mime: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type MediaUrl = z.infer<typeof MediaUrlSchema>;

/** Storage keys: events/<eventId>/<kind>/<id>[-<size>].<ext> (DatabaseDesign "media"). */
export const mediaKey = (eventId: string, kind: string, id: string, suffix: string) =>
  `events/${eventId}/${kind}/${id}${suffix}`;
