import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only sources: `nest start --watch` (pnpm dev) compiles test files into dist/.
    include: ['src/**/*.test.ts'],
  },
});
