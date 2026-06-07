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
    // E2E Playwright + fichiers de config/scripts : tournent côté Node, et les callbacks
    // page.evaluate() s'exécutent dans le navigateur → exposer les deux jeux de globals.
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'scripts/**/*.{ts,mjs,js}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
