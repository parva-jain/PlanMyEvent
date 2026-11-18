import { Inject, Injectable } from '@nestjs/common';
import { DASHBOARD_CACHE_SECONDS, dashboardCacheKey, dashboardGenerationKey } from '@pme/contracts';
import type { DashboardAggregate } from '@pme/core';
import { loadDashboardAggregate, type Database } from '@pme/db';
import type { Redis } from 'ioredis';

import { DB } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

/** Long enough for one recompute; the lock frees itself if its holder dies. */
const LOCK_MS = 5_000;
/** How long others wait for the recompute before doing it themselves. */
const WAIT_STEP_MS = 50;
const WAIT_STEPS = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The event's dashboard aggregate (SystemDesign 5.2): dash:v1:{eventId}:{generation} in Redis
 * for 30 seconds, Postgres behind it. When it is missing, one request recomputes it under a short
 * lock and the others wait briefly for it (stampede protection), then compute it themselves.
 * Any Redis error means Postgres directly (CLAUDE.md rule 12).
 */
@Injectable()
export class DashboardCache {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async aggregate(eventId: string, now = new Date()): Promise<DashboardAggregate | null> {
    const load = () => loadDashboardAggregate(this.db, eventId, now);
    let generation: string | null;
    try {
      generation = await this.redis.get(dashboardGenerationKey(eventId));
    } catch {
      return load();
    }
    const key = dashboardCacheKey(eventId, generation ?? '0');
    const cached = await this.read(key);
    if (cached) return cached;

    const lock = `${key}:lock`;
    const locked = await this.redis.set(lock, '1', 'PX', LOCK_MS, 'NX').catch(() => null);
    if (locked !== 'OK') {
      for (let step = 0; step < WAIT_STEPS; step++) {
        await sleep(WAIT_STEP_MS);
        const ready = await this.read(key);
        if (ready) return ready;
      }
      return load();
    }
    try {
      const aggregate = await load();
      if (aggregate) {
        await this.redis
          .set(key, JSON.stringify(aggregate), 'EX', DASHBOARD_CACHE_SECONDS)
          .catch(() => undefined);
      }
      return aggregate;
    } finally {
      await this.redis.del(lock).catch(() => undefined);
    }
  }

  private async read(key: string): Promise<DashboardAggregate | null> {
    const value = await this.redis.get(key).catch(() => null);
    return value ? (JSON.parse(value) as DashboardAggregate) : null;
  }
}
