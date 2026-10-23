import { existsSync } from 'node:fs';

// Optional .env next to package.json; real environment variables always win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
