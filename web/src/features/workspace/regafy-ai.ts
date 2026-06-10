import type { JSONContent } from '@tiptap/core'

import type { GeneratedDocRecord } from '@/lib/db'
import { getSupabase } from '@/lib/supabase'
import { tiptapText, type RegafyFinding } from './regafy'

/**
 * Regafy IA (M4) — copilote en arrière-plan via l'Edge `regafy-ai` (Gemini/Vertex).
 * Deux analyses indépendantes (le front choisit ce qu'il envoie) :
 *  - **Validité des pièces** (multimodal, BATCH) : Gemini lit les PDF et extrait date/durée de
 *    validité ; appelé avec **toutes** les pièces à l'ouverture, puis **uniquement les nouvelles**
 *    à chaque upload (incrémental). Chaque constat porte un `pieceId` pour le merge.
 *  - **Conformité des lettres**. Assistif only ; clé GCP côté Edge.
 */
export interface RegafyAiPiece {
  pieceId: string
  /** Signature du contenu (updatedAt) — clé d'invalidation du cache d'analyse. */
  sig: string
  nodeNumber: string
  nodeLabel: string
  docType: string
  category: string
  fileName: string
  filePath: string
}

export interface RegafyLetterCtx {
  productName: string
  titulaire: string
  country: string
  agency: string
  /** Date de l'opération en cours (yyyy-mm-dd). */
  operationDate: string
}

interface EdgeFinding {
  pieceId?: string
  nodeNumber?: string
  nodeLabel?: string
  severity?: RegafyFinding['severity']
  message?: string
  translate?: boolean
  language?: string
}

async function invokeRegafy(body: Record<string, unknown>): Promise<RegafyFinding[]> {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Connexion requise pour l’analyse IA.')
  const { data, error } = await supabase.functions.invoke('regafy-ai', { body })
  if (error) throw new Error(error.message || 'Échec de l’analyse IA.')
  return ((data?.findings ?? []) as EdgeFinding[])
    .filter((f) => (f.message ?? '').trim().length > 0)
    .map((f, i) => ({
      id: `ai:${f.pieceId ?? f.nodeNumber ?? 'g'}:${i}`,
      nodeNumber: f.nodeNumber ?? '',
      nodeLabel: f.nodeLabel ?? '',
      severity: f.severity ?? 'info',
      message: f.message ?? '',
      source: 'ai' as const,
      pieceId: f.pieceId,
      translate: f.translate,
      language: f.language,
    }))
}

/** Validité (multimodal) d'un lot de pièces — 1 appel batch (Gemini lit tous les PDF d'un coup). */
export async function runRegafyValidity(
  pieces: RegafyAiPiece[],
  operationDate: string,
  agency: string,
  targetLang: string,
  productName: string,
  country: string,
): Promise<RegafyFinding[]> {
  if (pieces.length === 0) return []
  return invokeRegafy({
    operationDate,
    agency,
    targetLang,
    productName,
    country,
    pieces,
    letters: [],
  })
}

/** Conformité des lettres générées (Cover/PGHT…). */
export async function runRegafyLetters(
  genDocs: GeneratedDocRecord[],
  ctx: RegafyLetterCtx,
): Promise<RegafyFinding[]> {
  const letters = genDocs
    .map((g) => ({
      nodeNumber: g.nodeNumber,
      nodeLabel: g.title ?? '',
      title: g.title ?? '',
      text: tiptapText((g.content ?? {}) as JSONContent).trim(),
    }))
    .filter((l) => l.text.length > 0)
  if (letters.length === 0) return []
  return invokeRegafy({
    operationDate: ctx.operationDate,
    productName: ctx.productName,
    titulaire: ctx.titulaire,
    country: ctx.country,
    agency: ctx.agency,
    letters,
  })
}
