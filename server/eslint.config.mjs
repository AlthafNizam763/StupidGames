import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // `allowDefaultProject` covers files outside any tsconfig - this config
        // file itself. Without it, type-aware linting refuses to parse them.
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // A forgotten `await` on a database call is the classic source of a
      // request that returns before its write lands.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // Everything goes through the structured logger, which redacts secrets.
      // A stray console.log is how a password reaches a log file forever.
      'no-console': 'error',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      // Tests build fake Express objects, which needs casts the app code forbids.
      '@typescript-eslint/no-explicit-any': 'off',
      // `describe` and `it` from node:test return promises that the test runner
      // owns and awaits. Awaiting them at the call site is not how the API is
      // used, so the rule is a false positive here - and only here.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
