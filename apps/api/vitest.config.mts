import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // esbuild (Vitest's default) drops decorator metadata, which Nest's dependency injection reads.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // API tests boot the whole app; give a slow CI machine room.
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
