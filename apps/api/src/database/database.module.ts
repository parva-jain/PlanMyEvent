import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, createPool } from '@pme/db';
import type { Pool } from 'pg';

import { API_ENV } from '../config/config.module';
import type { ApiEnv } from '../config/env';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) =>
        createPool({ connectionString: env.DATABASE_URL, applicationName: 'pme-api' }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: createDb },
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
