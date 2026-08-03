import { reportError } from '@/lib/sentry'
import { syncDocuments } from './documents-sync'
import { syncParties } from './parties-sync'
import { syncRefOverrides } from './ref-overrides-sync'
import { syncRefContent } from './ref-sync'
import { syncProducts } from './sync'

// Sérialise les cycles catalogue : deux déclencheurs concurrents (montage, mutation, reconnexion,
// flush de déconnexion) ne s'entrelacent plus. Sans ça, la garde de ré-entrance de chaque
// `sync<Entité>` (`if (syncing) return`) transforme l'étape PARENTE d'un cycle en no-op pendant
// qu'un autre cycle la tient — et l'enfant part quand même, en premier.
let chain: Promise<void> = Promise.resolve()

/**
 * Synchronise la chaîne catalogue dans l'ORDRE imposé par les clés étrangères :
 * `parties` (← products.titulaire_id / fabricant_id) → `products` (← documents.product_id) → `documents`.
 *
 * À appeler après TOUTE mutation catalogue, à la place des `sync<Entité>` isolés : un `syncProducts()`
 * seul pousse le produit AVANT le titulaire créé dans la même foulée → violation de FK 23503
 * (observée en prod le 2026-07-12 depuis /catalogue, Sentry JAVASCRIPT-REACT-9).
 *
 * Chaque `sync<Entité>` avale et remonte déjà ses propres erreurs : la chaîne ne doit JAMAIS rester
 * rejetée, sinon tous les cycles suivants seraient sautés en silence. Ce qui s'en échappe malgré
 * tout (ex. `getSupabase()` qui casse sur un chunk lazy manquant) est remonté ICI — sans ça, le
 * `catch` de survie masquerait une erreur qui atteignait Sentry en rejet non capturé.
 */
export function syncCatalogue(orgId: string): Promise<void> {
  const next = chain
    .then(async () => {
      await syncParties(orgId)
      await syncProducts(orgId)
      await syncDocuments(orgId)
      // Adaptations locales du référentiel (0077) : DANS la chaîne, contrairement au pull de
      // contenu — elles portent des ÉCRITURES utilisateur (outbox), qui doivent partir avec le
      // flush de déconnexion. Aucune FK avec les maillons amont : la place en fin est un choix
      // de priorité (ne pas retarder la chaîne critique), pas une contrainte d'ordre.
      await syncRefOverrides(orgId)
    })
    .catch((error: unknown) => reportError(error, { op: 'sync', entity: 'catalogue' }))
  chain = next
  // Référentiel réglementaire (0071) : pull-only, AUCUNE FK avec la chaîne → HORS file
  // sérialisée. Dans la chaîne, il retarderait le cycle suivant (donc un push utilisateur)
  // et consommerait la fenêtre du flush de déconnexion (`flush-outbox` await ce retour).
  // Fire-and-forget sûr : syncRefContent avale et trace ses propres erreurs, et se throttle.
  void syncRefContent(orgId)
  return next
}
