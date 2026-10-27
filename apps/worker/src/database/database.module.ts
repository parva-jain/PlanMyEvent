import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, createPool, type Database } from '@pme/db';

import { WORKER_ENV } from '../config/config.module';
import type { WorkerEnv } from '../config/env';

type Pool = ReturnType<typeof createPool>;

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [WORKER_ENV],
      useFactory: (env: WorkerEnv) =>
        createPool({ connectionString: env.DATABASE_URL, max: 4, applicationName: 'pme-worker' }),
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool): Database => createDb(pool) },
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
