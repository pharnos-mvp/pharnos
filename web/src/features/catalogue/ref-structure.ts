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
/**
 * Activités qu'un delta peut viser — miroir de `CTD_ACTIVITIES` (Edge) et des codes réellement
 * portés par `dossiers.activity`. Sans cette borne, une coquille (« variations » au pluriel) se
 * publiait, se faisait adopter, et ne s'appliquait à aucun dossier (Major M6, revue P4.5).
 * `transfer` a quitté le sélecteur mais reste porté par des dossiers existants.
 */
export const CTD_ACTIVITY_CODES = [
  'new_ma',
  'renewal',
  'variation',
  'notif_response',
  'transfer',
] as const
const ACTIVITIES = new Set<string>(CTD_ACTIVITY_CODES)
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
  // Le parent d'un `add` se déduit du numéro : un numéro à un seul segment n'en a pas, et
  // `applyStructureDeltas` l'ignore (un delta ne crée pas un module entier). Refusé des DEUX
  // côtés, sinon l'Edge publierait un ajout que le client n'applique jamais.
  if (kind === 'add' && number.split('.').length < 2) return undefined
  const label = typeof v.label === 'string' ? v.label.trim() : ''
  if (kind !== 'remove' && label === '') return undefined
  if (v.format !== undefined && !(typeof v.format === 'string' && FORMATS.has(v.format))) {
    return undefined
  }
  let activities: string[] | undefined
  if (v.activities !== undefined) {
    if (!Array.isArray(v.activities) || v.activities.length === 0) return undefined
    if (!v.activities.every((a) => typeof a === 'string' && ACTIVITIES.has(a.trim()))) {
      return undefined
    }
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

/** Ce payload ABROGE les changements de structure du pays (retour à l'arborescence de référence) ? */
export const isStructureReset = (payload: unknown): boolean =>
  isObj(payload) && payload.reset === true

/**
 * Deltas exploitables d'un payload — `undefined` si AUCUN ne l'est (le résolveur ne compte alors
 * ni le badge de version ni la provenance : publier n'aurait rien changé).
 *
 * Une ABROGATION (`reset: true`) rend un tableau VIDE, pas `undefined` : elle dit bien quelque
 * chose sur la structure (« plus aucun écart national »), donc elle mérite son badge de version et
 * sa source citée — et zéro delta appliqué vaut socle, sans une ligne de code de plus.
 */
export function structureFromPayload(payload: unknown): CtdDelta[] | undefined {
  if (isStructureReset(payload)) return []
  if (!isObj(payload) || !Array.isArray(payload.deltas)) return undefined
  const out = payload.deltas.map(deltaFromPayload).filter((d): d is CtdDelta => d !== undefined)
  return out.length > 0 ? out : undefined
}

/**
 * L'arbre servi pour ce couple est-il l'arbre de VARIATION ? (`getModule1Tree` : variation + CTD
 * UEMOA seulement — en eCTD, une variation retombe sur l'arbre standard.)
 */
export const usesVariationTree = (format: 'ctd' | 'ectd', activity?: string): boolean =>
  format === 'ctd' && activity === 'variation'

/**
 * Deltas concernant ce format et cette activité (filtres absents = toutes… SAUF la variation).
 *
 * **L'arbre de variation est OPT-IN** (Major M4, revue P4.5) : ce n'est pas l'arbre standard
 * amputé, c'est un arbre DIFFÉRENT dont la numérotation est homonyme sans être synonyme —
 * « 1.2.1 » y désigne le formulaire de demande de VARIATION, pas celui d'une nouvelle AMM. Un
 * delta rédigé face à l'arbre d'enregistrement (« ajouter 1.2.9 », « renommer 1.3.3 ») ne s'y
 * transpose donc pas mécaniquement : l'appliquer par défaut réécrirait le plan de montage des
 * dossiers de variation sur la foi d'un numéro qui ne parle pas de la même pièce.
 * Viser la variation reste possible — il faut le DIRE (`activities: ['variation']`).
 */
export function deltasFor(
  deltas: CtdDelta[],
  format: 'ctd' | 'ectd',
  activity?: string,
): CtdDelta[] {
  const variation = usesVariationTree(format, activity)
  return deltas.filter(
    (d) =>
      (d.format === undefined || d.format === format) &&
      (d.activities === undefined
        ? !variation
        : activity !== undefined && d.activities.includes(activity)),
  )
}

/**
 * Identité CANONIQUE d'un delta — tout ce qui détermine son effet, portée COMPRISE.
 *
 * Deux deltas de même genre/numéro/libellé mais de portée différente sont deux règles
 * différentes : les confondre fait dire « rien ne change » à un dialogue de consentement alors
 * que resserrer `activities` remet une section en exigence pour trois activités sur quatre
 * (Major M-1, revue P4.5c). Une seule définition, partagée par le diff et le contrôle d'effet.
 */
export const deltaKey = (d: CtdDelta): string =>
  [
    d.kind,
    d.number,
    d.label ?? '',
    d.note ?? '',
    d.format ?? '',
    [...(d.activities ?? [])].sort().join('+'),
  ].join('|')

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

/** Nœud portant ce numéro, à n'importe quelle profondeur. */
export function findByNumber(nodes: CtdNodeDef[], number: string): CtdNodeDef | undefined {
  for (const n of nodes) {
    if (n.number === number) return n
    const hit = n.children ? findByNumber(n.children, number) : undefined
    if (hit) return hit
  }
  return undefined
}

const hasNumber = (nodes: CtdNodeDef[], number: string): boolean =>
  findByNumber(nodes, number) !== undefined

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

/* ─── Contrôle d'EFFET (éditeur god) ────────────────────────────────────────────────────────────
 *
 * Le contrat partagé (`refPayloadEffective`) répond « ce delta est-il BIEN FORMÉ ? ». Il ne peut
 * pas répondre « vise-t-il un nœud qui EXISTE ? » : l'arborescence socle vit dans le bundle web
 * (`module1-tree.ts`) et la dupliquer en Deno recréerait exactement la dette payée en #419.
 * Le contrôle d'existence se fait donc là où l'arbre est disponible — dans l'éditeur god, AVANT
 * l'enregistrement (règle ⑤ du mockup : « numéro inconnu, nœud parent absent = refusé »). Le god
 * est derrière une double barrière (`is_platform_admin` + service-role) : le risque couvert ici
 * est la COQUILLE, pas l'attaquant.
 */

export type CtdDeltaIssue =
  /** Numéro absent du SOCLE de tous les arbres visés → coquille de saisie. FAUTE. */
  | 'unknown_node'
  /** `add` dont le parent déduit du numéro n'existe nulle part → orphelin, jamais monté. FAUTE. */
  | 'orphan'
  /** Le nœud existe au socle mais une AUTRE ligne de l'entrée l'a déjà emporté. */
  | 'masked'
  /** Ligne REDONDANTE (doublon, ou valeur déjà celle du socle) : même arbre sans elle. Avis. */
  | 'no_change'

/**
 * Du plus clément au plus grave. Un delta inerte l'est souvent pour des raisons DIFFÉRENTES selon
 * l'arbre visé : on rapporte la plus clémente, sinon un `relabel 1.2.7` (nœud retiré du seul arbre
 * « nouvelle AMM », bien présent dans les quatre autres) serait accusé de numéro inconnu — faux
 * quatre fois sur cinq, et le god part chasser une coquille qui n'existe pas (M1, revue P4.5b).
 */
const SEVERITY: Record<CtdDeltaIssue, number> = {
  no_change: 0,
  masked: 1,
  orphan: 2,
  unknown_node: 2,
}

/** Couples (format, activité) possibles — l'ensemble des arbres socle qu'un delta peut viser. */
const SCOPES: ['ctd' | 'ectd', string][] = (['ctd', 'ectd'] as const).flatMap((f) =>
  CTD_ACTIVITY_CODES.map((a) => [f, a] as ['ctd' | 'ectd', string]),
)

/** Empreinte structurelle d'un arbre (numéro + libellé + note, récursif) — comparaison d'EFFET. */
export function treeSignature(nodes: CtdNodeDef[]): string {
  return nodes
    .map((n) => `${n.number}|${n.label}|${n.note ?? ''}(${treeSignature(n.children ?? [])})`)
    .join(',')
}

/**
 * Pourquoi ce delta n'a rien produit — appelé UNIQUEMENT sur un delta déjà prouvé inerte.
 *
 * L'existence du nœud se juge sur le SOCLE, jamais sur l'arbre où les lignes voisines ont déjà
 * frappé : sans cette distinction, un simple `remove` DUPLIQUÉ (et `remove` est le genre par
 * défaut d'une nouvelle ligne) faisait accuser « ce numéro n'existe pas » et bloquait
 * l'enregistrement du brouillon ENTIER — tous pays, toutes sections (B1, revue P4.5b).
 * L'arbre APPLIQUÉ ne sert qu'à distinguer « masqué par une autre ligne » de « redondant ».
 */
function classify(socle: CtdNodeDef[], applied: CtdNodeDef[], d: CtdDelta): CtdDeltaIssue {
  if (d.kind === 'add') {
    const parent = parentNumber(d.number)
    if (parent === null || (!hasNumber(socle, parent) && !hasNumber(applied, parent))) {
      return 'orphan'
    }
    // Parent réel mais absent de l'arbre appliqué ⇒ une autre ligne l'a retiré : contradiction
    // interne de l'entrée, pas une coquille de numéro.
    return hasNumber(applied, parent) ? 'no_change' : 'masked'
  }
  // Symétrique du cas `add` : un nœud CRÉÉ par une autre ligne de l'entrée est un numéro
  // parfaitement valide — l'accuser d'être inconnu enverrait le god corriger un numéro correct.
  if (!hasNumber(socle, d.number) && !hasNumber(applied, d.number)) return 'unknown_node'
  return hasNumber(applied, d.number) ? 'no_change' : 'masked'
}

/**
 * Problème de chaque delta, ou `null` s'il produit un effet **dans au moins un arbre qu'il vise**.
 *
 * Test d'effet DIFFÉRENTIEL : l'arbre obtenu avec toute la liste est-il différent de celui obtenu
 * SANS cette ligne ? C'est la seule définition exacte de « cette ligne sert à quelque chose », et
 * elle attrape d'un coup le numéro inconnu, l'orphelin, la redondance ET l'annulation mutuelle
 * (un `add 1.2.9` suivi d'un `remove 1.2.9`, ou d'un `remove` de son parent : la ligne se publie,
 * s'adopte, et ne monte jamais rien). Comparer chaque ligne au socle isolément ne voyait rien de
 * tout cela — bloquant B1 de la revue P4.5b.
 *
 * `treeFor` est injectée par l'appelant (`getModule1Tree`) : ce module reste sans dépendance sur
 * les données d'arborescence, donc chargeable partout où le résolveur l'est déjà.
 *
 * Un delta n'est fautif que s'il est inerte PARTOUT : « retirer 1.2.7 » est légitime même si
 * l'arbre « nouvelle AMM » ne le contient pas (le renouvellement, si).
 */
export function structureDeltaIssues(
  deltas: CtdDelta[],
  treeFor: (format: 'ctd' | 'ectd', activity: string) => CtdNodeDef[],
): (CtdDeltaIssue | null)[] {
  // ⚠️ Les lignes sont distinguées par IDENTITÉ D'OBJET (`x !== d`) : deux lignes de contenu
  // identique doivent être deux objets distincts, ce que garantit `draftToDelta` (une allocation
  // par appel). Le doublon EXACT est donc sorti ici, avant le test différentiel — sinon chacune
  // « sert » (retirer l'une laisse l'autre) et le doublon passerait inaperçu.
  const firstIndexByKey = new Map<string, number>()
  deltas.forEach((d, i) => {
    const k = deltaKey(d)
    if (!firstIndexByKey.has(k)) firstIndexByKey.set(k, i)
  })
  // Le différentiel se joue sur la liste DÉDOUBLONNÉE : sinon deux lignes jumelles se couvrent
  // l'une l'autre (retirer l'une laisse l'autre agir) et TOUTES DEUX passent pour inutiles —
  // alors que la première fait le travail. C'est la seconde qui est en trop, et elle seule.
  const unique = deltas.filter((d, i) => firstIndexByKey.get(deltaKey(d)) === i)

  // Une seule application par scope pour la liste COMPLÈTE (le reste est en N+1, pas 2N).
  const fullByScope = new Map<string, string>()
  for (const [f, a] of SCOPES) {
    fullByScope.set(
      `${f}|${a}`,
      treeSignature(applyStructureDeltas(treeFor(f, a), deltasFor(unique, f, a))),
    )
  }

  return deltas.map((d, i) => {
    if (firstIndexByKey.get(deltaKey(d)) !== i) return 'no_change' // doublon d'une ligne au-dessus
    let worst: CtdDeltaIssue | null = null
    for (const [f, a] of SCOPES) {
      const scoped = deltasFor(unique, f, a)
      if (!scoped.includes(d)) continue // cette ligne ne vise pas cet arbre
      const socle = treeFor(f, a)
      const withoutTree = applyStructureDeltas(
        socle,
        scoped.filter((x) => x !== d),
      )
      if (fullByScope.get(`${f}|${a}`) !== treeSignature(withoutTree)) return null // elle sert ici
      const issue = classify(socle, withoutTree, d)
      if (worst === null || SEVERITY[issue] < SEVERITY[worst]) worst = issue
    }
    // `worst` null ⇒ aucun arbre visé : impossible tant que `activities` est bornée à des codes
    // connus (`deltaFromPayload`), mais un delta qui ne vise rien serait inerte par construction.
    return worst ?? 'unknown_node'
  })
}

/**
 * Cette liste de deltas produirait-elle EXACTEMENT l'arborescence déjà en vigueur ?
 *
 * Le payload d'une section REMPLACE celui de la version précédente — il ne s'y ajoute pas. Une
 * entrée qui re-déclare mot pour mot ce qui est déjà publié est donc licite… et parfaitement
 * inerte : la cloche sonne chez tous les clients, l'admin adopte, et rien ne change. C'est la
 * panne « version publiée qui ne rend rien », vue depuis le contenu et non depuis la forme.
 */
export function structureIsInert(
  next: CtdDelta[],
  published: CtdDelta[],
  treeFor: (format: 'ctd' | 'ectd', activity: string) => CtdNodeDef[],
): boolean {
  return SCOPES.every(([f, a]) => {
    const base = treeFor(f, a)
    return (
      treeSignature(applyStructureDeltas(base, deltasFor(next, f, a))) ===
      treeSignature(applyStructureDeltas(base, deltasFor(published, f, a)))
    )
  })
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
