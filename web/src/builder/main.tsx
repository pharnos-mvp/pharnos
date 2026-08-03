/**
 * Point d'entrée du CTD Builder autonome — SÉPARÉ de celui de la plateforme (`src/main.tsx`).
 *
 * Ce que ce fichier ne fait PAS, et chaque absence est délibérée :
 *  • pas de Sentry — aucune télémétrie ne doit sortir d'un poste qui monte un dossier d'AMM ;
 *  • pas de capture de code d'invitation — le produit se vend sans compte (§7.2) ;
 *  • pas d'enregistrement de service worker — la mise à jour applicative doit être ATOMIQUE
 *    (§4.4 : coquille ancienne + chunks neufs = écran mort). C'est le lot B9, conçu comme tel :
 *    on ne pose pas un service worker sur une origine avant d'avoir décidé sa stratégie de
 *    mise à jour, parce qu'on ne le retire plus des navigateurs qui l'ont installé.
 *
 * L'absence du client Supabase, des modules de synchronisation et de l'outbox n'est pas confiée à
 * la vigilance : elle est VÉRIFIÉE à chaque build (`src/builder/isolation.ts`).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Polices de marque auto-hébergées, comme la plateforme : aucune requête vers un CDN de polices
// (qui apprendrait au passage qu'un poste travaille sur un dossier).
import '@fontsource-variable/dm-sans/standard.css'
import '@fontsource-variable/syne'
import '@/index.css'
import { BuilderShell } from '@/builder/BuilderShell'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Élément racine #root introuvable')
}

createRoot(rootEl).render(
  <StrictMode>
    <BuilderShell />
  </StrictMode>,
)
