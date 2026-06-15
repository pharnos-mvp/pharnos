import type { JSONContent } from '@tiptap/core'
import { toast } from 'sonner'

import type { GeneratedDocRecord } from '@/lib/db'
import { tStatic } from '@/lib/i18n-context'
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
  /** Date d'expiration DÉCLARÉE par l'utilisateur (Monitor) — Regafy fait la contre-expertise (O3). */
  declaredExpiry?: string | null
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
  upgrade?: boolean
  missing?: string[]
}

/**
 * Types de documents couverts par la vérification de conformité au template (et le bouton
 * Upgrader) — miroir client de `specForDocType` (Edge, _shared/conformity-specs.ts).
 */
export const UPGRADE_DOC_TYPES = new Set(['cover', 'pght', 'rcp', 'notice', 'labeling', 'artwork'])

async function invokeRegafy(body: Record<string, unknown>): Promise<RegafyFinding[]> {
  const supabase = await getSupabase()
  if (!supabase)
    throw new Error(
      tStatic({
        fr: 'Connexion requise pour l’analyse IA.',
        en: 'Connection required for AI analysis.',
      }),
    )
  const { data, error } = await supabase.functions.invoke('regafy-ai', { body })
  if (error) {
    // Gating d'offre (jalon O) : 403 = Regafy hors offre (Free → Monitor seul) ; 429 = quota tokens.
    const status = (error as { context?: Response }).context?.status
    if (status === 403)
      throw new Error(
        tStatic({
          fr: 'Regafy (copilote IA) n’est pas inclus dans votre offre — Monitor reste disponible.',
          en: 'Regafy (AI copilot) is not included in your plan — Monitor remains available.',
        }),
      )
    if (status === 429)
      throw new Error(
        tStatic({
          fr: 'Quota d’analyses IA du mois atteint pour votre organisation.',
          en: 'Monthly AI analysis quota reached for your organization.',
        }),
      )
    throw new Error(
      error.message || tStatic({ fr: 'Échec de l’analyse IA.', en: 'AI analysis failed.' }),
    )
  }
  if (data?.degraded === true) {
    // L'Edge n'a pas pu analyser les lettres : le dire explicitement — un silence ici serait
    // un faux négatif (« aucun constat » lu comme « lettres conformes »).
    toast.warning(
      tStatic({
        fr: 'Analyse Regafy des lettres indisponible',
        en: 'Regafy letter analysis unavailable',
      }),
      {
        description: tStatic({
          fr: 'Réessayez plus tard — les constats affichés peuvent être incomplets.',
          en: 'Try again later — the findings shown may be incomplete.',
        }),
      },
    )
  }
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
      upgrade: f.upgrade,
      missing: f.missing,
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
  countryCode?: string,
): Promise<RegafyFinding[]> {
  if (pieces.length === 0) return []
  return invokeRegafy({
    operationDate,
    agency,
    targetLang,
    productName,
    country,
    countryCode,
    pieces,
    letters: [],
  })
}

/**
 * Conformité au template en vigueur d'un lot de TEXTES (traductions de pièces) — le constat
 * porte l'id du document généré dans `pieceId` (clé du merge/cache côté client).
 */
export async function runRegafyConformityTexts(
  texts: Array<{
    id: string
    nodeNumber: string
    nodeLabel: string
    docType: string
    text: string
  }>,
  countryCode?: string,
): Promise<RegafyFinding[]> {
  if (texts.length === 0) return []
  return invokeRegafy({ conformityTexts: texts, countryCode, letters: [] })
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
