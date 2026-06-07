import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from '@/App'
import { initSentry } from '@/lib/sentry'

// Observabilité : no-op si VITE_SENTRY_DSN absent ; sinon charge Sentry en chunk séparé.
void initSentry()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Élément racine #root introuvable')
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
