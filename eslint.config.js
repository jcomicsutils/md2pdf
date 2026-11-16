import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/backends/**', '../backends/**', './backends/**'],
              message: 'src/core may not import from src/backends.',
            },
            {
              group: ['katex', 'katex/**'],
              message: 'src/core may not import katex.',
            },
            {
              group: ['pagedjs', 'pagedjs/**'],
              message: 'src/core may not import pagedjs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/backends/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['markdown-it', 'markdown-it/**'],
              message: 'src/backends may not import markdown-it.',
            },
          ],
        },
      ],
    },
  }
);
