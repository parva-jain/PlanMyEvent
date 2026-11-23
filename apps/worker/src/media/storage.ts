import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';

export type BucketName = 'public' | 'private';

/** What the media jobs need from storage; tests use an in-memory one. */
export interface WorkerStorage {
  /** The object's bytes, or null if it isn't there. Refuses objects over `maxBytes`. */
  read(bucket: BucketName, key: string, maxBytes: number): Promise<Buffer | 'too_large' | null>;
  write(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void>;
  remove(bucket: BucketName, keys: string[]): Promise<void>;
}

/** S3-compatible storage (R2, SeaweedFS locally), as the worker uses it. */
@Injectable()
export class S3WorkerStorage implements WorkerStorage, OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor(@Inject(WORKER_ENV) env: WorkerEnv) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
      // Newer SDKs sign a checksum of the (empty) body into presigned URLs by default, which
      // R2 and SeaweedFS then reject for the real file: only add checksums when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.buckets = { public: env.S3_PUBLIC_BUCKET, private: env.S3_PRIVATE_BUCKET };
  }

  async read(bucket: BucketName, key: string, maxBytes: number) {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      if ((res.ContentLength ?? 0) > maxBytes) {
        await res.Body?.transformToWebStream().cancel();
        return 'too_large' as const;
      }
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async write(bucket: BucketName, key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        Body: body,
        ContentType: contentType,
        // Versions never change: a new upload gets a new id.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async remove(bucket: BucketName, keys: string[]) {
    for (let start = 0; start < keys.length; start += 1000) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.buckets[bucket],
          Delete: { Objects: keys.slice(start, start + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

export const WORKER_STORAGE = Symbol('WORKER_STORAGE');
