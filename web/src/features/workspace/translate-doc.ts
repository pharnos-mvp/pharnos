import type { JSONContent } from '@tiptap/core'

import { env } from '@/lib/env'
import { tStatic } from '@/lib/i18n-context'
import { getSupabase } from '@/lib/supabase'

/**
 * Convertit le texte traduit en contenu TipTap éditable : chaque ligne devient un paragraphe
 * (les lignes vides = paragraphes vides pour préserver l'espacement). Permet l'édition au menu
 * de format et la compilation dans le dossier.
 */
export function textToTiptap(text: string): JSONContent {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  return {
    type: 'doc',
    content: lines.map((line) =>
      line.trim()
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
    ),
  }
}

interface TranslateInput {
  /** Pièce uploadée (chemin Storage) — exclusif avec `text`. */
  filePath?: string
  fileName?: string
  /** Texte source (document généré : version conforme, template rempli) — exclusif `filePath`. */
  text?: string
  docType: string
  targetLang: string
}

/**
 * Traduction (M5) — appelle l'Edge `translate` qui LIT le document (multimodal) et le traduit vers
 * la langue cible (terminologie MedDRA). Assistif : la traduction est proposée pour revue.
 *
 * Avec `onChunk` : STREAMING SSE — le texte arrive au fil de l'eau (~2 s au premier mot, décisif
 * sur bas débit). En cas d'échec d'établissement du flux, repli silencieux sur l'appel JSON.
 */
export async function translateDoc(
  input: TranslateInput,
  onChunk?: (textSoFar: string) => void,
): Promise<string> {
  if (onChunk) {
    try {
      return await translateDocStream(input, onChunk)
    } catch {
      // Repli : Edge antérieure au streaming, proxy qui bufferise, etc. → réponse JSON classique.
    }
  }
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la traduction.',
        en: 'Connection required for translation.',
      }),
    )
  const { data, error } = await supabase.functions.invoke('translate', { body: input })
  if (error)
    throw new Error(
      error.message || tStatic({ fr: 'Échec de la traduction.', en: 'Translation failed.' }),
    )
  const text = String(data?.text ?? '').trim()
  if (!text) throw new Error(tStatic({ fr: 'Traduction vide.', en: 'Empty translation.' }))
  return text
}

/** Lit le flux SSE de l'Edge (`stream: true`) : `data: {"text":"…"}`* puis `data: [DONE]`. */
async function translateDocStream(
  input: TranslateInput,
  onChunk: (textSoFar: string) => void,
): Promise<string> {
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la traduction.',
        en: 'Connection required for translation.',
      }),
    )
  // fetch direct : functions.invoke ne donne pas accès au body en cours de flux.
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour la traduction.',
        en: 'Connection required for translation.',
      }),
    )

  const res = await fetch(`${env.supabaseUrl}/functions/v1/translate`, {
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
  if (!text) throw new Error(tStatic({ fr: 'Traduction vide.', en: 'Empty translation.' }))
  return text
}
