import type { JSONContent } from '@tiptap/core'

import type { GeneratedDocRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { tiptapText, type RegafyFinding } from './regafy'

/**
 * Regafy IA (M4) — copilote en arrière-plan via l'Edge Function `regafy-ai` (Gemini/Vertex).
 * Deux analyses : conformité des lettres (texte) + **validité des pièces (multimodal :** Gemini lit
 * le PDF/scan du document, en extrait date/durée de validité, calcul vs la date de l'opération).
 * Assistif only ; la clé GCP reste côté Edge.
 */
export interface RegafyAiPiece {
  nodeNumber: string
  nodeLabel: string
  docType: string
  category: string
  fileName: string
  filePath: string
}

export interface RegafyAiInput {
  genDocs: GeneratedDocRecord[]
  pieces: RegafyAiPiece[]
  productName: string
  titulaire: string
  country: string
  agency: string
  /** Date de l'opération en cours (yyyy-mm-dd) — base du calcul de validité restante. */
  operationDate: string
}

export async function runRegafyAI(input: RegafyAiInput): Promise<RegafyFinding[]> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour l’analyse IA.')

  const letters = input.genDocs
    .map((g) => ({
      nodeNumber: g.nodeNumber,
      nodeLabel: g.title ?? '',
      title: g.title ?? '',
      text: tiptapText((g.content ?? {}) as JSONContent).trim(),
    }))
    .filter((l) => l.text.length > 0)

  if (letters.length === 0 && input.pieces.length === 0) return []

  const { data, error } = await supabase.functions.invoke('regafy-ai', {
    body: {
      operationDate: input.operationDate,
      productName: input.productName,
      titulaire: input.titulaire,
      country: input.country,
      agency: input.agency,
      letters,
      pieces: input.pieces,
    },
  })
  if (error) throw new Error(error.message || 'Échec de l’analyse IA.')

  const rawFindings = (data?.findings ?? []) as Array<{
    nodeNumber?: string
    nodeLabel?: string
    severity?: RegafyFinding['severity']
    message?: string
  }>

  return rawFindings
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
