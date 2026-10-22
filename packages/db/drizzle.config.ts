import { defineConfig } from 'drizzle-kit';

import { loadDbEnv } from './src/env.js';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: { url: loadDbEnv().DATABASE_URL },
});
