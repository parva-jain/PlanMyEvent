import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Type-aware TypeScript rules shared by every workspace.
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function base({ tsconfigRootDir, ignores = [] }) {
  return defineConfig(
    { ignores: ['dist/**', 'coverage/**', '.next/**', '.turbo/**', ...ignores] },
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    { files: ['**/*.{js,mjs,cjs}'], extends: [tseslint.configs.disableTypeChecked] },
    prettier,
  );
}
