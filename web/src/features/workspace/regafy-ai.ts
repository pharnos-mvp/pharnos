import type { JSONContent } from '@tiptap/core'

import type { GeneratedDocRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { tiptapText, type RegafyFinding } from './regafy'

/**
 * Regafy IA (M4) — enrichit les constats déterministes via l'Edge Function `regafy-ai`
 * (Gemini/Vertex). Assistif only : les findings sont marqués `source: 'ai'` et ne bloquent
 * jamais la compilation. La clé GCP reste côté Edge (jamais exposée au client).
 */
export interface RegafyAiContext {
  productName: string
  titulaire: string
  country: string
  agency: string
}

export async function runRegafyAI(
  genDocs: GeneratedDocRecord[],
  ctx: RegafyAiContext,
): Promise<RegafyFinding[]> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour l’analyse IA.')

  const letters = genDocs
    .map((g) => ({
      nodeNumber: g.nodeNumber,
      nodeLabel: g.title ?? '',
      title: g.title ?? '',
      text: tiptapText((g.content ?? {}) as JSONContent).trim(),
    }))
    .filter((l) => l.text.length > 0)

  if (letters.length === 0) throw new Error('Aucune lettre générée à analyser.')

  const { data, error } = await supabase.functions.invoke('regafy-ai', {
    body: { ...ctx, letters },
  })
  if (error) throw new Error(error.message || 'Échec de l’analyse IA.')

  const raw = (data?.findings ?? []) as Array<{
    nodeNumber?: string
    nodeLabel?: string
    severity?: RegafyFinding['severity']
    message?: string
  }>

  return raw
    .filter((f) => (f.message ?? '').trim().length > 0)
    .map((f, i) => ({
      id: `ai:${f.nodeNumber || 'global'}:${i}`,
      nodeNumber: f.nodeNumber ?? '',
      nodeLabel: f.nodeLabel ?? '',
      severity: f.severity ?? 'info',
      message: f.message ?? '',
      source: 'ai' as const,
    }))
}
