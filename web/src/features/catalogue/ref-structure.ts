import type { CtdNodeDef } from '@/features/workspace/module1-tree'

/**
 * Deltas de STRUCTURE du Module 1 (P4.5) — le seul module CTD qui varie par pays.
 *
 * Le socle code (`getModule1Tree`) reste la référence ; une entrée `ctd_structure` publie des
 * DELTAS, jamais un arbre complet : un arbre publié figerait le pays hors de toute évolution du
 * socle (nouveaux formats, corrections) et une coquille y serait catastrophique.
 *
 * Miroir STRICT de `ctdDeltaEffective` (`supabase/functions/_shared/ref-payload.ts`), verrouillé
 * par les fixtures partagées : ce que l'Edge autorise à publier est EXACTEMENT ce qui s'applique
 * ici. Toute dérive = panne silencieuse (« publié mais sans effet », ou refus injustifié).
 *
 * Ce module ne DÉCIDE rien sur les dossiers : il calcule la structure officielle d'un pays.
 * L'application à un dossier existant est un acte volontaire, traité ailleurs (fusion P4.5c) —
 * ici on ne supprime jamais que ce qui n'existe pas encore chez l'utilisateur.
 */

export type CtdDeltaKind = 'add' | 'remove' | 'relabel'

export interface CtdDelta {
  kind: CtdDeltaKind
  /** Numérotation CTD — l'IDENTITÉ du nœud (jamais renommée). */
  number: string
  /** Libellé (obligatoire pour `add`/`relabel`). */
  label?: string
  /** Guidance réglementaire affichée sous le titre de la section. */
  note?: string
  /** Format visé ; absent = les deux. */
  format?: 'ctd' | 'ectd'
  /** Activités visées ; absent = toutes (décision A du mockup). */
  activities?: string[]
}

const CTD_NUMBER_RE = /^\d+(\.\d+)*$/
const KINDS = new Set<string>(['add', 'remove', 'relabel'])
const FORMATS = new Set<string>(['ctd', 'ectd'])
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Normalise UN delta ; `undefined` = inapplicable (le client l'ignore, l'Edge le refuse). */
export function deltaFromPayload(v: unknown): CtdDelta | undefined {
  if (!isObj(v)) return undefined
  const kind =
    typeof v.kind === 'string' && KINDS.has(v.kind) ? (v.kind as CtdDeltaKind) : undefined
  if (!kind) return undefined
  const number = typeof v.number === 'string' ? v.number.trim() : ''
  if (!CTD_NUMBER_RE.test(number)) return undefined
  // Un `remove` ne vise qu'un nœud de PROFONDEUR ≥ 3 segments (« 1.2.6 »), jamais une branche de
  // premier niveau (« 1.2 ») ni la racine : retirer « 1.2 » effacerait 26 nœuds d'un coup, et les
  // pièces auto-classées dessous (COPP, BPF…) deviendraient invisibles ET absentes du PDF compilé
  // — sans un mot à l'utilisateur (Major M2 de la revue P4.5). Un texte qui supprime une branche
  // entière se publie en plusieurs deltas explicites.
  if (kind === 'remove' && number.split('.').length < 3) return undefined
  const label = typeof v.label === 'string' ? v.label.trim() : ''
  if (kind !== 'remove' && label === '') return undefined
  if (v.format !== undefined && !(typeof v.format === 'string' && FORMATS.has(v.format))) {
    return undefined
  }
  let activities: string[] | undefined
  if (v.activities !== undefined) {
    if (!Array.isArray(v.activities) || v.activities.length === 0) return undefined
    if (!v.activities.every((a) => typeof a === 'string' && a.trim() !== '')) return undefined
    activities = v.activities.map((a) => (a as string).trim())
  }
  const note = typeof v.note === 'string' && v.note.trim() !== '' ? v.note.trim() : undefined
  return {
    kind,
    number,
    ...(label !== '' ? { label } : {}),
    ...(note ? { note } : {}),
    ...(v.format ? { format: v.format as 'ctd' | 'ectd' } : {}),
    ...(activities ? { activities } : {}),
  }
}

/**
 * Deltas exploitables d'un payload — `undefined` si AUCUN ne l'est (le résolveur ne compte alors
 * ni le badge de version ni la provenance : publier n'aurait rien changé).
 */
export function structureFromPayload(payload: unknown): CtdDelta[] | undefined {
  if (!isObj(payload) || !Array.isArray(payload.deltas)) return undefined
  const out = payload.deltas.map(deltaFromPayload).filter((d): d is CtdDelta => d !== undefined)
  return out.length > 0 ? out : undefined
}

/** Deltas concernant ce format et cette activité (filtres absents = tout). */
export function deltasFor(
  deltas: CtdDelta[],
  format: 'ctd' | 'ectd',
  activity?: string,
): CtdDelta[] {
  return deltas.filter(
    (d) =>
      (d.format === undefined || d.format === format) &&
      (d.activities === undefined || (activity !== undefined && d.activities.includes(activity))),
  )
}

/** Numéro du parent déduit de la numérotation (« 1.2.9 » → « 1.2 ») ; racine → null. */
const parentNumber = (number: string): string | null => {
  const i = number.lastIndexOf('.')
  return i === -1 ? null : number.slice(0, i)
}

/** Insère un nœud parmi ses frères en respectant l'ordre NUMÉRIQUE des segments (1.2.10 > 1.2.9). */
function insertOrdered(siblings: CtdNodeDef[], node: CtdNodeDef): CtdNodeDef[] {
  const seq = (n: string) => n.split('.').map(Number)
  const before = (a: string, b: string): boolean => {
    const [x, y] = [seq(a), seq(b)]
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const [xi, yi] = [x[i] ?? -1, y[i] ?? -1]
      if (xi !== yi) return xi < yi
    }
    return false
  }
  const at = siblings.findIndex((s) => before(node.number, s.number))
  if (at === -1) return [...siblings, node]
  return [...siblings.slice(0, at), node, ...siblings.slice(at)]
}

const hasNumber = (nodes: CtdNodeDef[], number: string): boolean =>
  nodes.some((n) => n.number === number || (n.children ? hasNumber(n.children, number) : false))

/**
 * Applique les deltas sur un arbre de RÉFÉRENCE (le socle du format/activité).
 *
 * Sémantique volontairement minimale et TOTALE (aucun delta ne peut faire échouer le calcul) :
 * - `add` : insère sous le parent déduit du numéro, à sa place numérique. Parent inconnu ⇒ delta
 *   IGNORÉ (publier « 1.9.1 » sans « 1.9 » ne doit pas créer un orphelin invisible) ; numéro déjà
 *   présent ⇒ traité comme un `relabel` (idempotence : rejouer une version ne duplique rien).
 * - `relabel` : remplace libellé/note, JAMAIS le numéro (identité) ni les enfants.
 * - `remove` : retire le nœud de la structure OFFICIELLE. Ce que l'utilisateur a déjà déposé n'est
 *   pas concerné ici — la fusion d'un dossier existant ne supprime jamais un nœud porteur (P4.5c).
 */
export function applyStructureDeltas(tree: CtdNodeDef[], deltas: CtdDelta[]): CtdNodeDef[] {
  let out = tree
  // Ordre d'application : `add` d'abord (un `relabel` peut viser un nœud tout juste ajouté), puis
  // `relabel`, puis `remove` (retirer en dernier évite qu'un ajout sous un nœud retiré ressuscite
  // le parent). Sans cet ordre, le résultat dépendrait de la saisie du god.
  // Les `add` sont triés du PLUS PROCHE DE LA RACINE au plus profond : publier « 1.2.9 » et
  // « 1.2.9.1 » dans n'importe quel ordre doit donner le même arbre, sinon l'enfant serait perdu en
  // silence (son parent n'existant pas encore, il est ignoré) — Major M3 de la revue P4.5.
  const depth = (n: string) => n.split('.').length
  const ordered = [
    ...deltas.filter((d) => d.kind === 'add').sort((a, b) => depth(a.number) - depth(b.number)),
    ...deltas.filter((d) => d.kind === 'relabel'),
    ...deltas.filter((d) => d.kind === 'remove'),
  ]
  for (const d of ordered) {
    if (d.kind === 'remove') {
      out = removeByNumber(out, d.number)
      continue
    }
    if (d.kind === 'relabel' || hasNumber(out, d.number)) {
      out = relabelByNumber(out, d.number, d.label, d.note)
      continue
    }
    const parent = parentNumber(d.number)
    if (parent === null) continue // un delta ne crée pas un module entier
    if (!hasNumber(out, parent)) continue // parent absent → orphelin invisible, ignoré
    out = addUnder(out, parent, { number: d.number, label: d.label ?? '', note: d.note })
  }
  return out
}

function removeByNumber(nodes: CtdNodeDef[], number: string): CtdNodeDef[] {
  return nodes
    .filter((n) => n.number !== number)
    .map((n) => (n.children ? { ...n, children: removeByNumber(n.children, number) } : n))
}

function relabelByNumber(
  nodes: CtdNodeDef[],
  number: string,
  label?: string,
  note?: string,
): CtdNodeDef[] {
  return nodes.map((n) => {
    if (n.number === number) {
      return {
        ...n,
        ...(label ? { label } : {}),
        // Une note publiée remplace la guidance du socle ; absente, la guidance du socle reste.
        ...(note ? { note } : {}),
      }
    }
    return n.children ? { ...n, children: relabelByNumber(n.children, number, label, note) } : n
  })
}

function addUnder(nodes: CtdNodeDef[], parent: string, node: CtdNodeDef): CtdNodeDef[] {
  return nodes.map((n) => {
    if (n.number === parent) {
      return { ...n, children: insertOrdered(n.children ?? [], node) }
    }
    return n.children ? { ...n, children: addUnder(n.children, parent, node) } : n
  })
}
