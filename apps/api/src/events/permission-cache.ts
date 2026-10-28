import { Inject, Injectable } from '@nestjs/common';
import type { MemberAccess } from '@pme/core';
import { loadAccess, rolesVersionOf, type Database } from '@pme/db';
import type { Redis } from 'ioredis';

import { DB } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

/** SystemDesign 5.5: 10 minutes; role edits move roles_version, so stale keys are never read. */
const TTL_SECONDS = 600;

/**
 * Effective permissions for the guard: perm:{eventId}:{userId}:{rolesVersion} in Redis, with
 * Postgres behind it. Redis is a speed layer only (CLAUDE.md rule 12): any Redis error falls
 * back to the database. Non-members aren't cached, so joining takes effect at once.
 */
@Injectable()
export class PermissionCache {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async forUser(eventId: string, userId: string): Promise<MemberAccess | null> {
    const version = await rolesVersionOf(this.db, eventId);
    if (version === null) return null;
    const key = `perm:${eventId}:${userId}:${version}`;

    const cached = await this.redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as MemberAccess;

    const access = await loadAccess(this.db, eventId, userId);
    if (access) {
      await this.redis.set(key, JSON.stringify(access), 'EX', TTL_SECONDS).catch(() => undefined);
    }
    return access;
  }
}
