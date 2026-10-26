import { Inject, Injectable } from '@nestjs/common';
import type { DependencyCheck, HealthReady } from '@pme/contracts';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

import { PG_POOL } from '../database/database.module';
import { LifecycleService } from '../lifecycle/lifecycle.service';
import { REDIS } from '../redis/redis.module';

const CHECK_TIMEOUT_MS = 2_000;

async function timed(check: () => Promise<unknown>): Promise<DependencyCheck> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { status: 'down', error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly lifecycle: LifecycleService,
  ) {}

  async ready(): Promise<HealthReady> {
    const [postgres, redis] = await Promise.all([
      timed(() => this.pool.query('select 1')),
      timed(async () => {
        if (this.redis.status === 'wait' || this.redis.status === 'end') {
          await this.redis.connect();
        }
        return this.redis.ping();
      }),
    ]);
    const ok = !this.lifecycle.isDraining && postgres.status === 'up' && redis.status === 'up';
    return { status: ok ? 'ok' : 'error', checks: { postgres, redis } };
  }
}
