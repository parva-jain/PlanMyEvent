import { Global, Module } from '@nestjs/common';

import { loadWorkerEnv } from './env';

export const WORKER_ENV = Symbol('WORKER_ENV');

@Global()
@Module({
  providers: [{ provide: WORKER_ENV, useFactory: () => loadWorkerEnv() }],
  exports: [WORKER_ENV],
})
export class ConfigModule {}
