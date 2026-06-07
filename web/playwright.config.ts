import { defineConfig, devices } from '@playwright/test'

/**
 * E2E Pharnos — local-first & offline.
 *
 * On sert le **build de production** (`vite preview`) pour disposer du service worker PWA
 * (test hors-ligne réel). Les variables Supabase sont forcées à vide → l'app démarre en
 * **mode local/offline** (sans auth, org locale), 100 % déterministe et sans backend ni secret.
 */
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Force le mode local (pas d'auth) quel que soit le .env.local de la machine.
    // Les vars VITE_ inline ont priorité sur les fichiers .env dans Vite.
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      PHARNOS_E2E: '1',
    },
  },
})
