import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import { base } from './base.js';

/** Base rules plus Next.js (core web vitals, React hooks) and browser globals, for apps/web. */
export function next(options) {
  return defineConfig(
    base({ ...options, ignores: ['next-env.d.ts', ...(options.ignores ?? [])] }),
    nextVitals,
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  );
}
