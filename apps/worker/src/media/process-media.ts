import { MAX_UPLOAD_BYTES, MEDIA_SIZES } from '@pme/contracts';
import type { MediaOutcome } from '@pme/core';
import sharp from 'sharp';

import type { BucketName, WorkerStorage } from './storage';

/** What the job knows about the upload (its row). */
export interface PendingMedia {
  id: string;
  kind: 'gallery' | 'receipt' | 'cover';
  bucket: BucketName;
  storageKey: string;
}

/** Photo formats sharp reads (HEIC needs a HEVC decoder that the prebuilt sharp lacks). */
const PHOTO_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString('latin1') === '%PDF-';

/**
 * Turns an upload into what the app shows (SystemDesign 5.7):
 * - the real type is read from the bytes (the declared one is never trusted);
 * - photos become two WebP versions, 320 and 1600 px wide, turned upright and without the
 *   camera's metadata (sharp drops EXIF, including GPS, unless asked to keep it); the original
 *   is deleted, so no file with a location in it stays in storage;
 * - a PDF receipt is kept as it is (receipts are private);
 * - anything else fails and its file is deleted.
 * Storage errors throw, so the job is retried.
 */
export async function processMedia(
  item: PendingMedia,
  storage: WorkerStorage,
): Promise<MediaOutcome> {
  const original = await storage.read(item.bucket, item.storageKey, MAX_UPLOAD_BYTES);
  if (original === null) return { status: 'failed' };
  if (original === 'too_large') {
    await storage.remove(item.bucket, [item.storageKey]);
    return { status: 'failed' };
  }

  if (item.kind === 'receipt' && isPdf(original)) {
    return {
      status: 'ready',
      mime: 'application/pdf',
      bytes: original.length,
      width: null,
      height: null,
      variants: { file: item.storageKey },
    };
  }

  const format = await sharp(original)
    .metadata()
    .then((meta) => meta.format)
    .catch(() => undefined);
  if (!format || !PHOTO_FORMATS.has(format)) {
    await storage.remove(item.bucket, [item.storageKey]);
    return { status: 'failed' };
  }

  const base = item.storageKey.replace(/\.[^./]+$/, '');
  const version = async (width: number) =>
    sharp(original, { failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width === MEDIA_SIZES.thumb ? 70 : 82 })
      .toBuffer({ resolveWithObject: true });
  let thumb: Awaited<ReturnType<typeof version>>;
  let display: Awaited<ReturnType<typeof version>>;
  try {
    [thumb, display] = await Promise.all([
      version(MEDIA_SIZES.thumb),
      version(MEDIA_SIZES.display),
    ]);
  } catch {
    // A file that claims to be a photo but can't be decoded (or a HEIC sharp can't read).
    await storage.remove(item.bucket, [item.storageKey]);
    return { status: 'failed' };
  }
  const keys = {
    thumb: `${base}-${MEDIA_SIZES.thumb}.webp`,
    display: `${base}-${MEDIA_SIZES.display}.webp`,
  };
  await storage.write(item.bucket, keys.thumb, thumb.data, 'image/webp');
  await storage.write(item.bucket, keys.display, display.data, 'image/webp');
  await storage.remove(item.bucket, [item.storageKey]);
  return {
    status: 'ready',
    mime: 'image/webp',
    bytes: display.data.length,
    width: display.info.width,
    height: display.info.height,
    variants: keys,
  };
}
