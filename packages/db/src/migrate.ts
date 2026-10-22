import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { createDb, createPool } from './client.js';
import { loadDbEnv } from './env.js';

// Arbitrary constant shared by every deploy, so two migrate steps never run together.
const MIGRATION_LOCK_ID = 7_301_026;

const { DATABASE_URL } = loadDbEnv();
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const lockClient = new pg.Client({ connectionString: DATABASE_URL });
const pool = createPool({ connectionString: DATABASE_URL, max: 1, applicationName: 'pme-migrate' });

try {
  await lockClient.connect();
  await lockClient.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
  await migrate(createDb(pool), { migrationsFolder });
  console.log('Migrations applied');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await lockClient.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
  await lockClient.end();
  await pool.end();
}
