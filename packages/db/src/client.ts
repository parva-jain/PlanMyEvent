import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface PoolOptions {
  connectionString: string;
  max?: number;
  applicationName?: string;
}

/** A small pool per container; PgBouncer sits in front once there are several (SystemDesign step 6). */
export function createPool({ connectionString, max = 10, applicationName }: PoolOptions): pg.Pool {
  return new pg.Pool({
    connectionString,
    max,
    application_name: applicationName,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
  });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema, casing: 'snake_case' });
}
