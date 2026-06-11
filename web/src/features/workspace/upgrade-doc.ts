import { env } from '@/lib/env'
import { getSupabase } from '@/lib/supabase'

/**
 * Marqueur des rubriques sans information source (contrat avec l'Edge `upgrade`) — compté par
 * la bannière de revue : l'utilisateur doit compléter ces rubriques avant usage.
 */
export const MISSING_MARKER = '[NON FOURNI DANS LE DOCUMENT SOURCE]'

/** Nombre d'occurrences d'un marqueur dans un texte (bannières de revue upgrade/fill). */
export function countMarker(text: string, marker: string): number {
  return text.split(marker).length - 1
}

/** Nombre de rubriques restant à compléter dans un texte/contenu upgradé. */
export function countMissing(text: string): number {
  return countMarker(text, MISSING_MARKER)
}

export interface UpgradeInput {
  /** Pièce uploadée (chemin Storage) — exclusif avec `text`. */
  filePath?: string
  fileName?: string
  /** Texte source (traduction déjà produite) — exclusif avec `filePath`. */
  text?: string
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
 * [NON FOURNI DANS LE DOCUMENT SOURCE]). Assistif : la version produite est à relire.
 *
 * Avec `onChunk` : streaming SSE (le document s'écrit au fil de l'eau) ; repli JSON sinon.
 */
export async function upgradeDoc(
  input: UpgradeInput,
  onChunk?: (textSoFar: string) => void,
): Promise<string> {
  if (onChunk) {
    try {
      return await upgradeDocStream(input, onChunk)
    } catch {
      // Repli : flux indisponible (proxy qui bufferise…) → réponse JSON classique.
    }
  }
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour la mise en conformité.')
  const { data, error } = await supabase.functions.invoke('upgrade', { body: input })
  if (error) throw new Error(error.message || 'Échec de la mise en conformité.')
  const text = String(data?.text ?? '').trim()
  if (!text) throw new Error('Mise en conformité vide.')
  return text
}

async function upgradeDocStream(
  input: UpgradeInput,
  onChunk: (textSoFar: string) => void,
): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour la mise en conformité.')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Connexion requise pour la mise en conformité.')

  const res = await fetch(`${env.supabaseUrl}/functions/v1/upgrade`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...input, stream: true }),
  })
  if (!res.ok || !res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error(`flux indisponible (${res.status})`)
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
  if (!text) throw new Error('Mise en conformité vide.')
  return text
}
