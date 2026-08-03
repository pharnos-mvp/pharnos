import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Primitives shadcn/ui : exportent leurs variantes (cva) à côté du composant.
    files: ['src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Moteur des livrables d'upgrade : le MÊME code fabrique les 5 fichiers sous Node (banc
    // d'essai de mesure) et dans le navigateur (livraison sur `/u/{token}`). Un `Buffer` ou un
    // `document.` qui s'y glisserait ne casserait QUE la livraison client — les tests, eux,
    // tournent en jsdom avec les globals Node, et ne verraient rien. D'où cette garde : la
    // pureté ne peut pas rester une phrase de commentaire.
    files: ['src/lib/deliverables/**/*.ts'],
    ignores: ['src/lib/deliverables/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['node:*'] }],
      'no-restricted-globals': [
        'error',
        'Buffer',
        'process',
        '__dirname',
        'require',
        'document',
        'window',
        'navigator',
        'localStorage',
      ],
    },
  },
  {
    // E2E Playwright + fichiers de config/scripts : tournent côté Node, et les callbacks
    // page.evaluate() s'exécutent dans le navigateur → exposer les deux jeux de globals.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'scripts/**/*.{ts,mjs,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
