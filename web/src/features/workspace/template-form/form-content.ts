// Persistance des FORMULAIRES de templates dans le `content` TipTap du document généré
// (templateKey 'fill') : le formulaire écrit un document FINAL (structure officielle +
// saisies + options cochées — champs vides omis, comme l'export des gabarits CEO).
// → TOUTE la chaîne aval reste inchangée : sync/zod, compilation PDF du dossier, vérification
// de conformité à l'enregistrement (tiptapText). Réhydratation via les attrs `fillKey`/
// `fillLine`/`fillOpts`/`fillSel` (+ `formGlobals` sur le titre) — tolérés par le schéma zod,
// ignorés par les rendus. Conventions IDENTIQUES au format RCP de la PR #112 (compatibilité
// des documents déjà sauvegardés).
import type { JSONContent } from '@tiptap/core'

import {
  emptyFormState,
  resolveText,
  type FormBlock,
  type FormGlobals,
  type TemplateFormDefinition,
  type TemplateFormState,
  blockHeadingText,
} from './form-types'

const HEADING_LEVEL = {
  title: 1,
  sec: 2,
  banner: 2,
  secDyn: 2,
  sub: 3,
  subDyn: 3,
  subsub: 4,
} as const

const lockedHeading = (
  text: string,
  level: number,
  extra: Record<string, unknown> = {},
): JSONContent => ({
  type: 'heading',
  attrs: { level, locked: true, ...extra },
  content: [{ type: 'text', text }],
})

const fillPara = (text: string, attrs: Record<string, unknown>): JSONContent => ({
  type: 'paragraph',
  attrs,
  ...(text ? { content: [{ type: 'text', text }] } : {}),
})

const plainPara = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

const bulletItems = (texts: string[]): JSONContent[] =>
  texts.map((t) => ({ type: 'listItem', content: [plainPara(t)] }))

/** Texte brut d'un nœud (concat des text nodes, récursif). */
function nodeText(n: JSONContent): string {
  if (n.type === 'text') return n.text ?? ''
  return (n.content ?? []).map(nodeText).join('')
}

const isChecked = (state: TemplateFormState, key: string | undefined): boolean =>
  !key || (state.checks[key] ?? []).includes(0)

/**
 * Construit le document TipTap FINAL depuis les saisies : structure officielle complète
 * (titres verrouillés + mentions statiques + textes dynamiques résolus), saisies non vides,
 * options cochées. Fidèle aux gabarits CEO : « le document ne contient que vos saisies et
 * les options cochées ».
 */
export function buildFillContent(
  def: TemplateFormDefinition,
  state: TemplateFormState,
): JSONContent {
  const g = state.globals
  const content: JSONContent[] = []
  let isFirstTitle = true

  for (const b of def.model) {
    switch (b.type) {
      case 'title': {
        // Les réglages globaux du document voyagent dans les attrs du PREMIER titre
        // (invisibles au rendu, tolérés par zod) — réhydratés à l'ouverture du formulaire.
        const extra = isFirstTitle && def.hasGlobalsBar ? { formGlobals: g } : {}
        content.push(lockedHeading(blockHeadingText(b.text), 1, extra))
        isFirstTitle = false
        break
      }
      case 'sec':
      case 'sub':
      case 'subsub':
        content.push(lockedHeading(blockHeadingText(b.text), HEADING_LEVEL[b.type]))
        break
      case 'banner':
        content.push(lockedHeading(blockHeadingText(b.text), 2, { banner: true }))
        break
      case 'secDyn':
      case 'subDyn':
        content.push(lockedHeading(blockHeadingText(b.dynText(g)), HEADING_LEVEL[b.type]))
        break
      case 'static':
        content.push(plainPara(b.text))
        break
      case 'dyn':
        content.push(plainPara(b.dynText(g)))
        break
      case 'rule':
        content.push({ type: 'horizontalRule' })
        break
      case 'bullets':
        content.push({
          type: 'bulletList',
          content: bulletItems(b.items.map((it) => resolveText(it, g))),
        })
        break
      case 'line': {
        if (b.dependsOn && !isChecked(state, b.dependsOn)) break
        const v = (state.values[b.key] ?? '').trim()
        if (!v) break
        content.push(fillPara(`${b.label ?? ''}${v}${b.suffix ?? ''}`, { fillKey: b.key }))
        break
      }
      case 'para': {
        if (b.dependsOn && !isChecked(state, b.dependsOn)) break
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
        if (isChecked(state, b.chkKey)) {
          content.push(fillPara(`${b.chkLabel}.`, { fillKey: b.chkKey }))
        }
        break
      }
      case 'checks': {
        const picked = [...(state.checks[b.key] ?? [])].sort((a, z) => a - z)
        if (picked.length === 0) break
        content.push({
          type: 'bulletList',
          attrs: { fillKey: b.key, fillOpts: picked },
          content: bulletItems(picked.map((i) => b.options[i] ?? '')),
        })
        break
      }
      case 'check': {
        if (!isChecked(state, b.key)) break
        const text = b.exportText ? b.exportText(state, g) : resolveText(b.text, g)
        content.push(
          b.asHeading
            ? {
                type: 'heading',
                attrs: { level: 3, fillKey: b.key },
                content: [{ type: 'text', text }],
              }
            : fillPara(text, { fillKey: b.key }),
        )
        break
      }
      case 'subSelect': {
        const chosen = state.selects[b.key] ?? ''
        if (!chosen) break
        const text = b.headingText ? b.headingText(chosen) : `${b.before}${chosen}`
        content.push({
          type: 'heading',
          attrs: { level: 3, fillKey: b.key, fillSel: chosen },
          content: [{ type: 'text', text }],
        })
        break
      }
      case 'subLine': {
        const v = (state.values[b.key] ?? '').trim()
        if (!v) break
        content.push({
          type: 'paragraph',
          attrs: { fillKey: b.key },
          content: [
            { type: 'text', text: b.before, marks: [{ type: 'bold' }] },
            { type: 'text', text: v },
          ],
        })
        break
      }
    }
  }
  return { type: 'doc', content }
}

/** Le contenu porte-t-il les marqueurs du formulaire (nouveau format) ? */
export function hasFormMarkers(content: JSONContent): boolean {
  return (content.content ?? []).some((n) => typeof n.attrs?.fillKey === 'string')
}

/** Réglages globaux valides relus depuis les attrs du titre (sinon défauts). */
function parseGlobals(raw: unknown): FormGlobals | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as { verb?: unknown; hcp?: Record<string, unknown> }
  if (g.verb !== 'prendre' && g.verb !== 'utiliser') return null
  return {
    verb: g.verb,
    hcp: {
      medecin: g.hcp?.medecin === true,
      pharmacien: g.hcp?.pharmacien === true,
      infirmier: g.hcp?.infirmier === true,
    },
  }
}

/**
 * Réhydrate les saisies depuis un contenu écrit par `buildFillContent`. Les libellés inline
 * (« Tél. : »), suffixes (« mois », « °C… ») et préfixes bold (subLine) sont retirés pour
 * retrouver la valeur saisie ; l'ordre des nœuds est indifférent (par fillKey).
 */
export function extractFormState(
  def: TemplateFormDefinition,
  content: JSONContent,
): TemplateFormState {
  const state = emptyFormState(def.model)
  const byKey = new Map<string, FormBlock>()
  const atcChkKeys = new Map<string, true>()
  for (const b of def.model) {
    if ('key' in b && b.key) byKey.set(b.key, b)
    if (b.type === 'atc') atcChkKeys.set(b.chkKey, true)
  }
  const paraLines = new Map<string, string[]>()

  for (const n of content.content ?? []) {
    const globals = parseGlobals(n.attrs?.formGlobals)
    if (globals) state.globals = globals

    const key = n.attrs?.fillKey
    if (typeof key !== 'string') continue

    if (n.type === 'bulletList') {
      const opts = n.attrs?.fillOpts
      if (Array.isArray(opts)) {
        state.checks[key] = opts.filter((x): x is number => typeof x === 'number')
      }
      continue
    }
    if (n.type === 'heading') {
      const block = byKey.get(key)
      if (block?.type === 'subSelect') {
        const sel = n.attrs?.fillSel
        if (typeof sel === 'string') state.selects[key] = sel
      } else if (block?.type === 'check') {
        state.checks[key] = [0]
      }
      continue
    }
    if (n.type !== 'paragraph') continue
    const text = nodeText(n)

    if (atcChkKeys.has(key)) {
      state.checks[key] = [0] // mention « non encore attribué » présente → cochée
      continue
    }
    const block = byKey.get(key)
    if (!block) continue
    switch (block.type) {
      case 'check':
        state.checks[key] = [0]
        break
      case 'atc': {
        const label = block.label
        state.values[key] = text.startsWith(label) ? text.slice(label.length) : text
        break
      }
      case 'line': {
        let v = text
        if (block.label && v.startsWith(block.label)) v = v.slice(block.label.length)
        if (block.suffix && v.endsWith(block.suffix)) v = v.slice(0, -block.suffix.length)
        state.values[key] = v
        break
      }
      case 'duree':
        state.values[key] = text.endsWith(' mois') ? text.slice(0, -' mois'.length) : text
        break
      case 'subLine':
        state.values[key] = text.startsWith(block.before) ? text.slice(block.before.length) : text
        break
      case 'para': {
        const lines = paraLines.get(key) ?? []
        const lineIdx = typeof n.attrs?.fillLine === 'number' ? n.attrs.fillLine : lines.length
        lines[lineIdx] = text
        paraLines.set(key, lines)
        break
      }
      default:
        break
    }
  }
  for (const [key, lines] of paraLines) {
    state.values[key] = Array.from(lines, (l) => l ?? '').join('\n')
  }
  return state
}

/* ----------------------------- Anciens squelettes [À COMPLÉTER] ----------------------------- */

// Récupération « best effort » des squelettes créés AVANT les formulaires (paragraphes
// [À COMPLÉTER] sous des titres de rubrique, sans attrs fillKey) : les saisies non-placeholder
// sont versées dans le champ principal de leur rubrique. Couvre les documents de recette.
const LEGACY_RUBRIC_KEY: Record<string, Record<string, string>> = {
  rcp: {
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
  },
  notice: {
    '1': 'cas_utilisation',
    '2': 'ne_jamais',
    '3': 'posologie',
    '4': 'ei_liste',
    '5': 'temp_conservation',
    '6': 'substances_actives',
  },
  labeling: {
    A1: 'denomination',
    A2: 'composition',
    A4: 'forme_contenu',
  },
}

export function extractLegacySkeletonState(
  def: TemplateFormDefinition,
  content: JSONContent,
): TemplateFormState {
  const state = emptyFormState(def.model)
  const map = LEGACY_RUBRIC_KEY[def.docType] ?? {}
  let currentKey: string | null = null
  for (const n of content.content ?? []) {
    if (n.type === 'heading') {
      const m = /^(A?\d+(?:\.\d+)*)\./.exec(nodeText(n).trim())
      currentKey = m ? (map[m[1]!] ?? null) : null
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

/** Réhydratation tous formats : formulaire (attrs) → legacy (squelette) — pour l'onglet ouvert. */
export function formStateFromContent(
  def: TemplateFormDefinition,
  content: JSONContent,
): TemplateFormState {
  return hasFormMarkers(content)
    ? extractFormState(def, content)
    : extractLegacySkeletonState(def, content)
}
