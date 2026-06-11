// Persistance du formulaire RCP dans le `content` TipTap du document généré (templateKey
// 'fill') : le formulaire écrit un document FINAL (titres officiels + mentions statiques +
// saisies + options cochées — les champs vides sont omis, comme l'export du gabarit CEO).
// → TOUTE la chaîne aval reste inchangée : sync/zod, compilation PDF du dossier, vérification
// de conformité à l'enregistrement (tiptapText). Les saisies sont réhydratées via les attrs
// `fillKey`/`fillLine`/`fillOpts` portés par les nœuds (tolérés par le schéma zod, ignorés
// par les rendus).
import type { JSONContent } from '@tiptap/core'

import type { ProductRecord } from '@/lib/db'
import { formatComposition } from '../composition'
import {
  blockHeadingText,
  emptyRcpFormState,
  RCP_FORM_MODEL,
  type RcpFormState,
} from './rcp-form-model'

const HEADING_LEVEL = { title: 1, sec: 2, sub: 3, subsub: 4 } as const

const lockedHeading = (text: string, level: number): JSONContent => ({
  type: 'heading',
  attrs: { level, locked: true },
  content: [{ type: 'text', text }],
})

/** Paragraphe d'une ligne de saisie — vide (sans content) si la ligne est vide. */
const fillPara = (text: string, attrs: Record<string, unknown>): JSONContent => ({
  type: 'paragraph',
  attrs,
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})

const plainPara = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

/** Texte brut d'un nœud (concat des text nodes, récursif). */
function nodeText(n: JSONContent): string {
  if (n.type === 'text') return n.text ?? ''
  return (n.content ?? []).map(nodeText).join('')
}

/**
 * Construit le document TipTap FINAL depuis les saisies : structure officielle complète
 * (titres verrouillés + mentions statiques), saisies non vides, options cochées en liste à
 * puces. Fidèle à l'export du gabarit CEO : « le document ne contient que vos saisies et les
 * options cochées ».
 */
export function buildRcpFillContent(state: RcpFormState): JSONContent {
  const content: JSONContent[] = []
  for (const b of RCP_FORM_MODEL) {
    switch (b.type) {
      case 'title':
      case 'sec':
      case 'sub':
      case 'subsub':
        content.push(lockedHeading(blockHeadingText(b.text ?? ''), HEADING_LEVEL[b.type]))
        break
      case 'static':
        content.push(plainPara(b.text ?? ''))
        break
      case 'rule':
        content.push({ type: 'horizontalRule' })
        break
      case 'line': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) content.push(fillPara(b.label ? `${b.label}${v}` : v, { fillKey: b.key }))
        break
      }
      case 'para': {
        const raw = state.values[b.key] ?? ''
        if (!raw.trim()) break
        raw.split(/\r?\n/).forEach((line, i) => {
          content.push(fillPara(line, { fillKey: b.key, fillLine: i }))
        })
        break
      }
      case 'duree': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) content.push(fillPara(`${v} mois`, { fillKey: b.key }))
        break
      }
      case 'atc': {
        const v = (state.values[b.key] ?? '').trim()
        if (v) content.push(fillPara(`${b.label}${v}`, { fillKey: b.key }))
        if ((state.checks[b.chkKey] ?? []).includes(0)) {
          content.push(fillPara(`${b.chkLabel}.`, { fillKey: b.chkKey }))
        }
        break
      }
      case 'checks': {
        const picked = state.checks[b.key] ?? []
        if (picked.length === 0) break
        content.push({
          type: 'bulletList',
          attrs: { fillKey: b.key, fillOpts: [...picked].sort((a, z) => a - z) },
          content: picked
            .slice()
            .sort((a, z) => a - z)
            .map((i) => ({
              type: 'listItem',
              content: [plainPara(b.options[i] ?? '')],
            })),
        })
        break
      }
    }
  }
  return { type: 'doc', content }
}

/** Le contenu porte-t-il les marqueurs du formulaire (nouveau format) ? */
export function hasRcpFormMarkers(content: JSONContent): boolean {
  return (content.content ?? []).some((n) => typeof n.attrs?.fillKey === 'string')
}

/**
 * Réhydrate les saisies depuis un contenu écrit par `buildRcpFillContent`. Les libellés
 * inline (« Tél. : ») et suffixes (« mois ») sont retirés pour retrouver la valeur saisie.
 */
export function extractRcpFormState(content: JSONContent): RcpFormState {
  const state = emptyRcpFormState()
  const byKey = new Map(
    RCP_FORM_MODEL.flatMap((b) => ('key' in b && b.key ? ([[b.key, b]] as const) : [])),
  )
  const atcBlocks = RCP_FORM_MODEL.filter((b) => b.type === 'atc')
  const paraLines = new Map<string, string[]>()

  for (const n of content.content ?? []) {
    const key = n.attrs?.fillKey
    if (typeof key !== 'string') continue

    if (n.type === 'bulletList') {
      const opts = n.attrs?.fillOpts
      if (Array.isArray(opts)) {
        state.checks[key] = opts.filter((x): x is number => typeof x === 'number')
      }
      continue
    }
    if (n.type !== 'paragraph') continue
    const text = nodeText(n)

    const atc = atcBlocks.find((b) => b.chkKey === key)
    if (atc) {
      state.checks[key] = [0] // case « non encore attribué » présente → cochée
      continue
    }
    const block = byKey.get(key)
    if (!block) continue
    if (block.type === 'line' || block.type === 'atc') {
      const label = 'label' in block ? (block.label ?? '') : ''
      state.values[key] = label && text.startsWith(label) ? text.slice(label.length) : text
    } else if (block.type === 'duree') {
      state.values[key] = text.endsWith(' mois') ? text.slice(0, -' mois'.length) : text
    } else if (block.type === 'para') {
      const lines = paraLines.get(key) ?? []
      const lineIdx = typeof n.attrs?.fillLine === 'number' ? n.attrs.fillLine : lines.length
      lines[lineIdx] = text
      paraLines.set(key, lines)
    }
  }
  for (const [key, lines] of paraLines) {
    state.values[key] = Array.from(lines, (l) => l ?? '').join('\n')
  }
  return state
}

// Récupération « best effort » des squelettes RCP créés AVANT le formulaire (paragraphes
// [À COMPLÉTER] sous des titres de rubrique, sans attrs fillKey) : les saisies non-placeholder
// sont versées dans le champ principal de leur rubrique. Couvre les docs de recette existants.
const LEGACY_RUBRIC_KEY: Record<string, string> = {
  '1': 'denomination',
  '2': 'composition',
  '3': 'forme',
  '4.1': 'indications',
  '4.2': 'posologie',
  '4.3': 'ci',
  '4.4': 'mises_en_garde',
  '4.5': 'interactions',
  '4.6': 'grossesse',
  '4.7': 'conduite',
  '4.8': 'ei',
  '4.9': 'surdosage',
  '5.1': 'mecanisme',
  '5.2': 'absorption',
  '5.3': 'preclinique',
  '6.1': 'liste_excipients',
  '6.2': 'incompatibilites',
  '6.3': 'duree_nombre',
  '6.4': 'conservation',
  '6.5': 'emballage',
  '6.6': 'elimination_manip',
  '7': 'amm_adresse',
  '7.1': 'amm_adresse',
  '7.2': 'fab_adresse',
  '8': 'num_amm',
  '9': 'date_premiere',
  '10': 'date_maj',
}

export function extractLegacySkeletonState(content: JSONContent): RcpFormState {
  const state = emptyRcpFormState()
  let currentKey: string | null = null
  for (const n of content.content ?? []) {
    if (n.type === 'heading') {
      const m = /^(\d+(?:\.\d+)*)\./.exec(nodeText(n).trim())
      currentKey = m ? (LEGACY_RUBRIC_KEY[m[1]!] ?? null) : null
      continue
    }
    if (n.type !== 'paragraph' || !currentKey) continue
    const text = nodeText(n).trim()
    if (!text || text === '[À COMPLÉTER]') continue
    state.values[currentKey] = state.values[currentKey]
      ? `${state.values[currentKey]}\n${text}`
      : text
  }
  return state
}

/**
 * État initial à la création : pré-remplissage STRICTEMENT limité à la session Identification
 * de la fiche produit (dénomination, composition, forme) — tout le reste à l'utilisateur
 * (exigence CEO, identique à l'ancien squelette).
 */
export function initialRcpFormState(product?: ProductRecord): RcpFormState {
  const state = emptyRcpFormState()
  if (!product) return state
  state.values.denomination = [product.nomCommercial, product.dosage, product.forme]
    .filter(Boolean)
    .join(', ')
  state.values.composition = formatComposition(product.dci, product.dosage)
  state.values.forme = product.forme ?? ''
  return state
}

/** Réhydratation tous formats : formulaire (attrs) → legacy (squelette) — pour l'onglet ouvert. */
export function rcpFormStateFromContent(content: JSONContent): RcpFormState {
  return hasRcpFormMarkers(content)
    ? extractRcpFormState(content)
    : extractLegacySkeletonState(content)
}

/** Nombre de champs texte encore vides (bannière de revue — les cases sont optionnelles). */
export function countEmptyRcpFields(state: RcpFormState): number {
  return Object.values(state.values).filter((v) => !v.trim()).length
}
