import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { processMedia, type PendingMedia } from './process-media';
import type { BucketName, WorkerStorage } from './storage';

/** Storage in a Map, keyed by bucket and key. */
function memoryStorage(files: Record<string, Buffer> = {}) {
  const objects = new Map<string, { body: Buffer; type?: string }>(
    Object.entries(files).map(([key, body]) => [key, { body }]),
  );
  const at = (bucket: BucketName, key: string) => `${bucket}:${key}`;
  const storage: WorkerStorage = {
    read: (bucket, key, max) => {
      const found = objects.get(at(bucket, key));
      if (!found) return Promise.resolve(null);
      return Promise.resolve(found.body.length > max ? 'too_large' : found.body);
    },
    write: (bucket, key, body, type) => {
      objects.set(at(bucket, key), { body, type });
      return Promise.resolve();
    },
    remove: (bucket, keys) => {
      for (const key of keys) objects.delete(at(bucket, key));
      return Promise.resolve();
    },
  };
  return { storage, objects };
}

/** A 2400×1600 JPEG with a GPS position in its EXIF, as a phone would take it. */
const photoWithLocation = () =>
  sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#d4a373' } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 15/1 0/1' } })
    .toBuffer();

const item = (overrides: Partial<PendingMedia> = {}): PendingMedia => ({
  id: 'm1',
  kind: 'gallery',
  bucket: 'public',
  storageKey: 'events/e1/gallery/m1.jpg',
  ...overrides,
});

describe('processMedia', () => {
  it('writes 320 and 1600 px WebP versions without the location, and deletes the original', async () => {
    const original = await photoWithLocation();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const { storage, objects } = memoryStorage({ 'public:events/e1/gallery/m1.jpg': original });

    const outcome = await processMedia(item(), storage);
    expect(outcome).toEqual({
      status: 'ready',
      mime: 'image/webp',
      bytes: expect.any(Number) as number,
      width: 1600,
      height: 1067,
      variants: {
        thumb: 'events/e1/gallery/m1-320.webp',
        display: 'events/e1/gallery/m1-1600.webp',
      },
    });
    expect([...objects.keys()].sort()).toEqual([
      'public:events/e1/gallery/m1-1600.webp',
      'public:events/e1/gallery/m1-320.webp',
    ]);
    const display = objects.get('public:events/e1/gallery/m1-1600.webp')!;
    expect(display.type).toBe('image/webp');
    const meta = await sharp(display.body).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1600 });
    expect(meta.exif).toBeUndefined();
    expect(
      (await sharp(objects.get('public:events/e1/gallery/m1-320.webp')!.body).metadata()).width,
    ).toBe(320);
  });

  it('keeps a PDF receipt as it is', async () => {
    const pdf = Buffer.from('%PDF-1.7\n%…\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');
    const key = 'events/e1/receipt/r1.pdf';
    const { storage, objects } = memoryStorage({ [`private:${key}`]: pdf });
    const outcome = await processMedia(
      item({ kind: 'receipt', bucket: 'private', storageKey: key }),
      storage,
    );
    expect(outcome).toMatchObject({
      status: 'ready',
      mime: 'application/pdf',
      variants: { file: key },
    });
    expect(objects.has(`private:${key}`)).toBe(true);
  });

  it('fails, and deletes, a file that only claims to be a photo; a PDF is no gallery photo', async () => {
    const { storage, objects } = memoryStorage({
      'public:events/e1/gallery/m1.jpg': Buffer.from('<script>alert(1)</script>'),
      'public:events/e1/gallery/m2.jpg': Buffer.from('%PDF-1.7 not a photo'),
    });
    expect(await processMedia(item(), storage)).toEqual({ status: 'failed' });
    expect(
      await processMedia(item({ id: 'm2', storageKey: 'events/e1/gallery/m2.jpg' }), storage),
    ).toEqual({ status: 'failed' });
    expect(objects.size).toBe(0);
  });

  it('fails a missing upload, and one over 15 MB', async () => {
    const { storage } = memoryStorage({
      'public:events/e1/gallery/big.jpg': Buffer.alloc(15 * 1024 * 1024 + 1),
    });
    expect(await processMedia(item(), storage)).toEqual({ status: 'failed' });
    expect(await processMedia(item({ storageKey: 'events/e1/gallery/big.jpg' }), storage)).toEqual({
      status: 'failed',
    });
  });
});
