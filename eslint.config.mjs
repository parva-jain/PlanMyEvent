// Lints root-level files only; each workspace has its own eslint.config.mjs.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['apps/**', 'packages/**', '**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  prettier,
];
