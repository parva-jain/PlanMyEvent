import {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';

/** Upload URLs live 10 minutes (APIDesign); private file links 5 (SystemDesign 5.7). */
const UPLOAD_SECONDS = 10 * 60;
const VIEW_SECONDS = 5 * 60;

export type BucketName = 'public' | 'private';

/** Injectable so tests can stand in for storage. */
export interface MediaStorage {
  /** A presigned PUT: the browser sends the file straight to storage. */
  uploadUrl(
    bucket: BucketName,
    key: string,
    mime: string,
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }>;
  /** Size of a stored object, or null if it isn't there. */
  size(bucket: BucketName, key: string): Promise<number | null>;
  /** A short-lived GET for a private file. */
  viewUrl(bucket: BucketName, key: string): Promise<{ url: string; expiresAt: Date }>;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/**
 * S3-compatible storage: Cloudflare R2 in production, SeaweedFS locally (decision 008). The
 * API only signs URLs and checks that uploads arrived; it never handles the bytes.
 */
@Injectable()
export class S3MediaStorage implements MediaStorage, OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
      // SeaweedFS and R2 both take bucket-in-path URLs; no per-bucket DNS needed.
      forcePathStyle: true,
      // Newer SDKs sign a checksum of the (empty) body into presigned URLs by default, which
      // R2 and SeaweedFS then reject for the real file: only add checksums when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.buckets = { public: env.S3_PUBLIC_BUCKET, private: env.S3_PRIVATE_BUCKET };
  }

  async uploadUrl(bucket: BucketName, key: string, mime: string) {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, ContentType: mime }),
      { expiresIn: UPLOAD_SECONDS, signableHeaders: new Set(['content-type']) },
    );
    return {
      url,
      headers: { 'Content-Type': mime },
      expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000),
    };
  }

  async size(bucket: BucketName, key: string) {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  async viewUrl(bucket: BucketName, key: string) {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      { expiresIn: VIEW_SECONDS },
    );
    return { url, expiresAt: new Date(Date.now() + VIEW_SECONDS * 1000) };
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
