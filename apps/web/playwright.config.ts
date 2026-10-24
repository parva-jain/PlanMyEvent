import { defineConfig, devices } from '@playwright/test';

// Its own port, so a `pnpm dev` on 3000 is never mistaken for the production build under test.
const PORT = 3100;

/**
 * Smoke tests against a production build (`next build` + `next start`): motion, hydration
 * and layout shift behave differently in dev mode. One desktop and one phone project; specs
 * opt into reduced motion with `test.use({ reducedMotion: 'reduce' })`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
