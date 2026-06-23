import type { ProductRecord } from '@/lib/db'
import type { LetterFields } from '@/features/workspace/letter-context'
import {
  VARIATION_FALLBACK,
  VARIATIONS,
  type PieceCode,
  type Variation,
  type VariationClass,
} from './variation-catalog'

/**
 * Modèle « demande de variation » (couche au-dessus du catalogue de référence).
 *
 * Une demande = un **sujet** (produit / pays / AMM, porté par `LetterFields`) + une **liste d'items
 * de changement**. Les deux besoins RA — *multi-variation* et *tableau comparatif* — sont le même
 * objet : chaque item porte `{ type, ancien → nouveau, justification }`. La lettre, le tableau
 * comparatif, la checklist de pièces et la redevance sont des **projections** de `items[]`.
 *
 * Pur, hors-ligne, déterministe. Persisté en `VariationRequestRecord` (Dexie v12).
 */

export interface VariationItem {
  /** n° du catalogue (1–42), ou null pour « Autre — non répertoriée ». */
  ref: number | null
  /** Libellé de la variation (pré-rempli depuis le catalogue, éditable). */
  nature: string
  class: VariationClass
  /** Rubrique / section concernée (ex. « RCP §4.2 », « Fabricant de l'API »). */
  rubrique: string
  /** Situation actuelle (approuvée) — colonne « ancien ». */
  before: string
  /** Situation proposée — colonne « nouveau ». */
  after: string
  justification: string
}

export interface VariationRequest {
  title: string
  /** Sujet : produit, pays cible, n° d'AMM, signataire, bascules de marque. */
  fields: LetterFields
  items: VariationItem[]
  /** Index (0–6) dans `GROUPING_RULES` justifiant le regroupement ; null si item unique. */
  groupingRuleIndex: number | null
}

/** Ordre canonique des pièces (pour une union stable). */
const PIECE_ORDER: PieceCode[] = [
  'lettre',
  'echantillon',
  'maquette',
  'recepisse',
  'module1',
  'dossierVariation',
  'tableauComparatif',
]

/** Sentinelle « Autre — variation non répertoriée » dans le sélecteur (n° réservé, hors 1–42). */
export const OTHER_REF = 0

export function lookupVariation(ref: number | null): Variation | undefined {
  if (ref === OTHER_REF) return VARIATION_FALLBACK
  return ref == null ? undefined : VARIATIONS.find((v) => v.n === ref)
}

export function emptyItem(): VariationItem {
  return {
    ref: null,
    nature: '',
    class: 'majeure',
    rubrique: '',
    before: '',
    after: '',
    justification: '',
  }
}

/** Pré-remplit un item depuis une variation du catalogue (n°, libellé FR, classe). */
export function itemFromVariation(v: Variation, nature: string): VariationItem {
  return { ...emptyItem(), ref: v.n ?? null, nature, class: v.class }
}

/** Pièces du catalogue pour un item (repli sur le jeu majeur pour « Autre »/non trouvé). */
function piecesForItem(it: VariationItem): readonly PieceCode[] {
  return lookupVariation(it.ref)?.pieces ?? VARIATION_FALLBACK.pieces
}

/**
 * Union ordonnée des pièces sur tous les items (regroupement = un seul dossier). La lettre est
 * toujours requise dès qu'il y a au moins un item.
 */
export function requestPieces(items: VariationItem[]): PieceCode[] {
  const set = new Set<PieceCode>()
  for (const it of items) for (const p of piecesForItem(it)) set.add(p)
  if (items.length) set.add('lettre')
  return PIECE_ORDER.filter((p) => set.has(p))
}

/** Redevance due = nombre de variations (l'annexe : « la redevance est exigée pour chaque variation »). */
export function requestFee(items: VariationItem[]): number {
  return items.length
}

/** Classe globale : majeure dès qu'un item est majeur. */
export function requestClass(items: VariationItem[]): VariationClass {
  return items.some((it) => it.class === 'majeure') ? 'majeure' : 'mineure'
}

/** Vrai si plusieurs items → une condition de regroupement doit être choisie. */
export function groupingNeeded(items: VariationItem[]): boolean {
  return items.length > 1
}

/** La demande est-elle complète pour générer ses livrables ? (≥1 item, regroupement justifié si multi). */
export function isRequestComplete(req: VariationRequest): boolean {
  if (req.items.length === 0) return false
  if (groupingNeeded(req.items) && req.groupingRuleIndex == null) return false
  return true
}

/** Variation (n°) → champ produit pré-rempli en colonne « ancien » (best-effort). */
const ANCIEN_FROM_PRODUCT: Record<number, (p: ProductRecord) => string> = {
  1: (p) => p.fabricant,
  2: (p) => p.titulaire,
  3: (p) => p.nomCommercial,
  4: (p) => p.dci,
  5: (p) => p.fabricant,
  6: (p) => p.codeAtc,
  9: (p) => p.titulaire,
}

/**
 * Items du tableau comparatif d'un dossier : reprend les items déjà édités s'il y en a, sinon amorce
 * depuis les variations cochées (nature + classe) en préremplissant la colonne « ancien » quand
 * Pharnos a la donnée (nom, DCI, ATC, titulaire, fabricant). « nouveau » reste à saisir.
 */
export function seedVariationItems(
  refs: number[],
  product?: ProductRecord,
  existing?: VariationItem[],
): VariationItem[] {
  // Réconcilie la liste sur `refs` (source de vérité) en préservant les saisies déjà faites (par ref).
  const prev = new Map((existing ?? []).map((it) => [it.ref, it]))
  return refs.map((r) => {
    const v = lookupVariation(r)
    const it = v ? itemFromVariation(v, v.nature.fr) : emptyItem()
    const before = product ? (ANCIEN_FROM_PRODUCT[r]?.(product) ?? '').trim() : ''
    const seeded = before ? { ...it, before } : it
    const old = prev.get(seeded.ref)
    return old
      ? {
          ...seeded,
          before: old.before,
          after: old.after,
          justification: old.justification,
          rubrique: old.rubrique,
        }
      : seeded
  })
}
