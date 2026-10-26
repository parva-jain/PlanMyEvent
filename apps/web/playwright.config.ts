import { defineConfig, devices } from '@playwright/test';

// Own ports, so a `pnpm dev` (web 3000, API 4000) is never mistaken for the build under test.
const WEB_PORT = 3100;
const API_PORT = 4100;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const reuse = !process.env.CI;

/**
 * Smoke tests against production builds (`next build` + `next start`): motion, hydration
 * and layout shift behave differently in dev mode. The API and worker run from their builds
 * (turbo builds them first) against the compose Postgres, Redis and Mailpit, or the CI
 * services. One desktop and one phone project; specs opt into reduced motion with
 * `test.use({ reducedMotion: 'reduce' })`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `${API_URL}/v1/health/ready`,
      env: { PORT: String(API_PORT), WEB_ORIGIN, API_URL, LOG_LEVEL: 'warn' },
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      // No HTTP port: ready once the relay starts polling.
      command: 'node ../worker/dist/main.js',
      wait: { stdout: /Outbox relay polling/ },
      env: { LOG_LEVEL: 'info' },
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm exec next start --port ${WEB_PORT}`,
      url: WEB_ORIGIN,
      env: { NEXT_PUBLIC_API_URL: API_URL },
      reuseExistingServer: reuse,
      timeout: 240_000,
    },
  ],
});
