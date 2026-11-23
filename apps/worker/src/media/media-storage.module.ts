import { Module } from '@nestjs/common';

import { S3WorkerStorage, WORKER_STORAGE } from './storage';

/** One S3 client for the media queue and the cleanup job. */
@Module({
  providers: [{ provide: WORKER_STORAGE, useClass: S3WorkerStorage }],
  exports: [WORKER_STORAGE],
})
export class MediaStorageModule {}
