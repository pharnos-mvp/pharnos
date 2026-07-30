import { activeOrgHeaders } from '@/features/org/active-org'
import { env } from '@/lib/env'
import { tStatic } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'

/**
 * Marqueur des rubriques sans information source (contrat avec l'Edge `upgrade`) — compté par
 * la bannière de revue : l'utilisateur doit compléter ces rubriques avant usage.
 */
export const MISSING_MARKER = '[Non fourni, à compléter]'

/** Nombre d'occurrences d'un marqueur dans un texte (bannières de revue upgrade/fill). */
export function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1
}

/** Nombre de rubriques restant à compléter dans un texte/contenu upgradé. */
export function countMissing(text: string): number {
  return countMarker(text, MISSING_MARKER)
}

/**
 * Le flux n'a pas démarré. Porte le STATUT, seul moyen de distinguer un défaut de transport (à
 * replier) d'un refus de l'Edge (à propager tel quel).
 */
class StreamUnavailableError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`flux indisponible (${status})`)
    this.name = 'StreamUnavailableError'
    this.status = status
  }
}

/** Un refus DÉTERMINISTE de l'Edge : le rejouer coûterait une seconde génération pour le même refus. */
function isClientRefusal(e: unknown): boolean {
  return e instanceof StreamUnavailableError && e.status >= 400 && e.status < 500
}

export interface UpgradeInput {
  /** Pièce uploadée (chemin Storage). */
  filePath?: string
  fileName?: string
  /**
   * Texte source. Deux rôles selon le contexte, et c'est `sourceKind` qui les distingue :
   *  - SEUL, c'est l'entrée du modèle (traduction déjà produite, document généré) ;
   *  - AVEC `filePath`, c'est le CORPUS DE CONTRÔLE d'un scan — le modèle lit la pièce.
   */
  text?: string
  /**
   * Provenance de `text` — déclarée, jamais devinée. `'ocr'` **exige** `filePath` : sans pièce, il
   * n'y a pas d'image fidèle à lire et c'est le texte reconstruit qui partirait au modèle, avec les
   * coquilles de notre propre lecture attribuées au client.
   */
  sourceKind?: 'text' | 'ocr'
  docType: string
  countryCode?: string
  /** Contexte certifié du dossier (fiche produit) — données vérifiées, pas des inventions. */
  dossierContext?: {
    activity?: string
    titulaire?: string
    titulaireAdresse?: string
    fabricant?: string
    fabricantAdresse?: string
  }
}

/**
 * Mise en conformité (Regafy Upgrade) — appelle l'Edge `upgrade` qui restructure le document
 * selon le template officiel en vigueur, ZÉRO invention (rubriques absentes marquées
 * [Non fourni, à compléter]). Assistif : la version produite est à relire.
 *
 * Avec `onChunk` : streaming SSE (le document s'écrit au fil de l'eau) ; repli JSON sinon.
 */
export async function upgradeDoc(
  input: UpgradeInput,
  onChunk?: (textSoFar: string) => void,
): Promise<string> {
  // Invariant vérifié ICI et pas seulement côté Edge : un aller-retour pour se faire répondre 400
  // coûte une seconde à l'utilisateur et n'apprend rien de plus qu'une garde locale. L'Edge le
  // revérifie — il ne fait jamais confiance au client — mais l'appelant fautif est nous.
  if (input.sourceKind === 'ocr' && !input.filePath) {
    throw new Error(
      tStatic({
        fr: 'Document scanné : la pièce d’origine est requise en plus du texte reconnu.',
        en: 'Scanned document: the original file is required alongside the recognised text.',
      }),
    )
  }
  if (onChunk) {
    try {
      return await upgradeDocStream(input, onChunk)
    } catch (e) {
      // ⚠️ Repli sur un défaut de TRANSPORT seulement (proxy qui bufferise, coupure réseau).
      // Attraper tout relançait une génération COMPLÈTE et facturée après un refus de l'Edge —
      // un 400 ou un 413 se reproduira à l'identique, et la cause réelle serait perdue au passage.
      // C'est aussi la règle du moteur : un appel qui a échoué pour une raison déterministe ne se
      // rejoue pas.
      if (isClientRefusal(e)) throw e
    }
  }
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la mise en conformité.',
        en: 'Connection required for compliance upgrade.',
      }),
    )
  const { data, error } = await supabase.functions.invoke('upgrade', {
    body: input,
    headers: activeOrgHeaders(),
  })
  if (error)
    throw new Error(
      error.message ||
        tStatic({ fr: 'Échec de la mise en conformité.', en: 'Compliance upgrade failed.' }),
    )
  const text = String(data?.text ?? '').trim()
  if (!text)
    throw new Error(tStatic({ fr: 'Mise en conformité vide.', en: 'Empty compliance upgrade.' }))
  return text
}

async function upgradeDocStream(
  input: UpgradeInput,
  onChunk: (textSoFar: string) => void,
): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la mise en conformité.',
        en: 'Connection required for compliance upgrade.',
      }),
    )
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la mise en conformité.',
        en: 'Connection required for compliance upgrade.',
      }),
    )

  const res = await fetch(`${env.supabaseUrl}/functions/v1/upgrade`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
      'content-type': 'application/json',
      ...activeOrgHeaders(),
    },
    body: JSON.stringify({ ...input, stream: true }),
  })
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new StreamUnavailableError(res.status)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const { text } = JSON.parse(payload) as { text?: string }
          if (text) {
            full += text
            onChunk(full)
          }
        } catch {
          /* fragment non-JSON → ignoré */
        }
      }
    }
  }
  const text = full.trim()
  if (!text)
    throw new Error(tStatic({ fr: 'Mise en conformité vide.', en: 'Empty compliance upgrade.' }))
  return text
}
