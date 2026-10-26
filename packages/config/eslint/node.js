import { defineConfig } from 'eslint/config';
import globals from 'globals';

import { base } from './base.js';

/** Base rules plus Node.js globals, for packages, the API and the worker. */
export function node(options) {
  return defineConfig(base(options), { languageOptions: { globals: globals.node } });
}
