import { createDb, createPool } from './client.js';
import { loadDbEnv } from './env.js';

// Idempotent demo seeds ("Sharma Wedding", "DevFest Bhopal 2026") arrive in milestone 9.
const { DATABASE_URL } = loadDbEnv();
const pool = createPool({ connectionString: DATABASE_URL, max: 1, applicationName: 'pme-seed' });

try {
  createDb(pool);
  console.log('No seed data yet (milestone 9).');
} finally {
  await pool.end();
}
