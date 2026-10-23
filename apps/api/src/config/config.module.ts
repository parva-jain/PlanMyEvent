import { Global, Module } from '@nestjs/common';

import { loadApiEnv } from './env';

export const API_ENV = Symbol('API_ENV');

@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: () => loadApiEnv() }],
  exports: [API_ENV],
})
export class ConfigModule {}
