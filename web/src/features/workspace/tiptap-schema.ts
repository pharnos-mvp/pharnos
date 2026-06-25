// Validation du contenu TipTap tiré du serveur (T6, PLAN-V2).
// Le `content` des documents générés est du JSON librement modifiable par tout client du
// tenant : un enregistrement corrompu (ou forgé) ne doit ni planter l'éditeur/compilation,
// ni introduire de nœud hors du périmètre rendu (StarterKit + Image base64 + TextAlign).
import type { JSONContent } from '@tiptap/core'
import { z } from 'zod'

// Bornes anti-abus avant le parse structurel (un JSON pathologique ne doit pas coûter cher).
const MAX_BYTES = 2 * 1024 * 1024
const MAX_DEPTH = 64

const textAlign = z.enum(['left', 'center', 'right', 'justify'])

const markSchema = z.object({
  type: z.enum(['bold', 'italic', 'strike', 'code']),
  attrs: z.record(z.string(), z.unknown()).optional(),
})

const textNode = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(markSchema).optional(),
})

// Les images sont inline et UNIQUEMENT en data URL (signature, branding, scans insérés) :
// pas d'URL distante — pas d'exfiltration via requête image ni de contenu tiers.
const imageNode = z.object({
  type: z.literal('image'),
  attrs: z
    .object({
      src: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
      alt: z.string().nullish(),
      title: z.string().nullish(),
    })
    .passthrough(),
})

type BlockNode = JSONContent

const blockNode: z.ZodType<BlockNode> = z.lazy(() =>
  z.union([
    textNode,
    imageNode,
    z.object({
      type: z.enum([
        'paragraph',
        'heading',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'codeBlock',
        'horizontalRule',
        'hardBreak',
        // Tableaux (extension-table) : table > tableRow > (tableHeader|tableCell) > blocs. La
        // grammaire fine est laissée à TipTap ; ici on borne le coût (profondeur/taille) et les
        // attrs de fusion pour qu'un contenu serveur à tableau ne soit pas mis en quarantaine.
        'table',
        'tableRow',
        'tableHeader',
        'tableCell',
      ]),
      attrs: z
        .object({
          level: z.number().int().min(1).max(6).optional(),
          textAlign: textAlign.nullish(),
          start: z.number().int().optional(),
          // Cellules : fusion + largeurs de colonne bornées (anti-abus sur un payload forgé).
          colspan: z.number().int().min(1).max(64).optional(),
          rowspan: z.number().int().min(1).max(64).optional(),
          colwidth: z.array(z.number().int().min(0).max(4000)).max(64).nullish(),
        })
        .passthrough()
        .optional(),
      content: z.array(blockNode).optional(),
    }),
  ]),
)

const docSchema = z.object({
  type: z.literal('doc'),
  // `brand` (bool) : affiche/masque le papier à en-tête/pied (toggle 1 clic). Préservé au pull.
  attrs: z.object({ brand: z.boolean().optional() }).passthrough().optional(),
  content: z.array(blockNode).optional(),
})

/** Profondeur réelle de l'arbre — itératif (un payload hostile ne doit pas faire déborder la pile). */
function depthOf(value: unknown): number {
  let max = 0
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }]
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (depth > MAX_DEPTH) return depth // court-circuit : déjà trop profond
    if (depth > max) max = depth
    if (node && typeof node === 'object') {
      const children = (node as { content?: unknown }).content
      if (Array.isArray(children)) {
        for (const c of children) stack.push({ node: c, depth: depth + 1 })
      }
    }
  }
  return max
}

/**
 * Valide un contenu TipTap d'origine serveur. Renvoie le contenu typé, ou `null` s'il est
 * invalide (l'appelant décide : conserver la version locale ou mettre en quarantaine).
 */
export function parseTiptapContent(value: unknown): JSONContent | null {
  if (value === null || typeof value !== 'object') return null
  try {
    if (JSON.stringify(value).length > MAX_BYTES) return null
  } catch {
    return null // structures cycliques ou non sérialisables
  }
  if (depthOf(value) > MAX_DEPTH) return null
  const parsed = docSchema.safeParse(value)
  return parsed.success ? (parsed.data as JSONContent) : null
}

/**
 * Raison d'invalidité d'un contenu TipTap, ou `null` s'il est valide. Sert à rendre les rapports
 * d'erreur ACTIONNABLES (ex. au pull) : « schema-invalid » ≠ « too-large » appellent des fixes
 * différents. N'appeler que sur le chemin déjà jugé invalide (re-vérifie les mêmes règles).
 */
export function tiptapInvalidReason(
  value: unknown,
): 'not-object' | 'unserializable' | 'too-large' | 'too-deep' | 'schema-invalid' | null {
  if (value === null || typeof value !== 'object') return 'not-object'
  let length: number
  try {
    length = JSON.stringify(value).length
  } catch {
    return 'unserializable'
  }
  if (length > MAX_BYTES) return 'too-large'
  if (depthOf(value) > MAX_DEPTH) return 'too-deep'
  if (!docSchema.safeParse(value).success) return 'schema-invalid'
  return null
}

/** Contenu de quarantaine : document vide valide (l'éditeur s'ouvre, rien ne casse). */
export const EMPTY_DOC: JSONContent = { type: 'doc', content: [] }
