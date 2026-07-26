import type { CtdNodeDef } from './module1-tree'
import { assignIds, flattenTree } from './tree-utils'

/**
 * Plan de FUSION de structure d'un dossier (P4.5c, mockup ③ `docs/mockups/ctd-structure-fusion.html`).
 *
 * Un dossier monté est une **photographie opposable** : quand la structure officielle de son pays
 * change, on ne fusionne pas — on PROPOSE, ligne par ligne, et l'utilisateur décide. Ce module
 * calcule ce qui est proposé et applique la sélection ; il ne parle ni de réseau ni de rendu.
 *
 * LES DEUX GARANTIES, ici et pas dans l'UI :
 *   1. **Aucun document n'est jamais supprimé.** Une section devenue facultative qui porte une
 *      pièce (ou l'un de ses descendants) — ou qui a été VALIDÉE — n'est pas retirable : elle passe
 *      en `keep`, signalée « conservée ». Seul le VIDE non validé peut quitter le plan de montage.
 *   2. **Rien ne bouge sans sélection.** `applyMergePlan` n'applique que les lignes cochées ; tout
 *      le reste du dossier (ids, `savedAt`, sections personnalisées) est préservé à l'identique.
 */

export type MergeLineKind = 'add' | 'relabel' | 'drop' | 'keep'

export interface MergeLine {
  kind: MergeLineKind
  /** Numérotation CTD — l'identité du nœud, et la clé de sélection (`kind:number`). */
  number: string
  /** Libellé CIBLE (`add`/`relabel`) ou libellé actuel du dossier (`drop`/`keep`). */
  label: string
  /** Libellé actuel dans le dossier — `relabel` uniquement (colonne « avant »). */
  currentLabel?: string
  /** Pièces portées par la section ET ses descendants (`drop`/`keep`). */
  docCount?: number
  /** Pourquoi la section ne peut PAS être retirée — TOUJOURS renseigné sur un `keep`. */
  keepReason?: 'documents' | 'validated'
  /** Nombre de sous-sections apportées avec un `add` (le nœud peut être une branche). */
  childCount?: number
}

/** Clé de sélection d'une ligne — stable, indépendante de l'ordre d'affichage. */
export const mergeLineKey = (l: Pick<MergeLine, 'kind' | 'number'>): string =>
  `${l.kind}:${l.number}`

/**
 * Lignes cochées PAR DÉFAUT : les AJOUTS seulement.
 *
 * Un ajout est additif — au pire l'utilisateur a une section vide de plus. Un RETRAIT enlève
 * quelque chose de son plan de montage et un RENOMMAGE écrase un intitulé qu'il a peut-être écrit
 * lui-même : ces deux-là exigent un geste. Pré-cocher une ligne destructrice, c'est transformer
 * n'importe quel décalage d'affichage en perte de travail.
 */
export const defaultChosen = (plan: MergeLine[]): Set<string> =>
  new Set(plan.filter((l) => l.kind === 'add').map(mergeLineKey))

const byNumber = (nodes: CtdNodeDef[]) => new Map(flattenTree(nodes).map((n) => [n.number, n]))

/**
 * Copie SANS identifiant, récursivement. L'id d'un nœud est propre au dossier : si la structure
 * officielle en portait un (aujourd'hui le socle n'en a pas, mais c'est une hypothèse sur un AUTRE
 * module), l'importer tel quel ferait entrer un id étranger — voire un doublon d'un nœud existant,
 * et `setNodeSaved`/`deleteNode`, qui ciblent par id, toucheraient deux sections à la fois.
 * `assignIds` ne remplit que les ids ABSENTS : on les retire donc d'abord.
 */
const stripIds = (n: CtdNodeDef): CtdNodeDef => {
  const copy: CtdNodeDef = { ...n, ...(n.children ? { children: n.children.map(stripIds) } : {}) }
  delete copy.id
  return copy
}

/**
 * Compare l'arbre DU DOSSIER à la structure OFFICIELLE de son pays et retourne les lignes à
 * soumettre à l'utilisateur. Ordre stable : ajouts, renommages, retraits proposés, conservations.
 *
 * `countFor` compte les pièces d'UN nœud ; on somme sur le sous-arbre — retirer « 1.2.9 » qui n'a
 * rien mais dont l'enfant « 1.2.9.1 » porte un COPP serait la même perte.
 */
export function buildMergePlan(
  current: CtdNodeDef[],
  official: CtdNodeDef[],
  countFor: (node: CtdNodeDef) => number,
): MergeLine[] {
  const cur = byNumber(current)
  const off = byNumber(official)
  const adds: MergeLine[] = []
  const relabels: MergeLine[] = []
  const drops: MergeLine[] = []
  const keeps: MergeLine[] = []

  for (const [number, o] of off) {
    const c = cur.get(number)
    if (!c) {
      // Un ajout dont le PARENT est lui aussi absent viendra avec lui : ne pas proposer deux fois.
      const parent = number.slice(0, number.lastIndexOf('.'))
      if (parent && off.has(parent) && !cur.has(parent)) continue
      adds.push({
        kind: 'add',
        number,
        label: o.label,
        childCount: flattenTree([o]).length - 1,
      })
      continue
    }
    if (o.label && c.label !== o.label) {
      relabels.push({ kind: 'relabel', number, label: o.label, currentLabel: c.label })
    }
  }

  for (const [number, c] of cur) {
    // Une section SANS numéro est une section « maison » créée par l'utilisateur (`newNode`) : elle
    // n'appartient pas à la structure officielle, elle n'a rien à faire dans un plan de fusion. Sans
    // ce garde, toutes se collapsaient sur la clé '' de la Map — UNE case cochée en supprimait
    // plusieurs, dont une validée, sous le libellé d'une autre (bloquant B2 de la revue).
    if (!number) continue
    if (off.has(number)) continue
    // Un descendant d'une section déjà listée est emporté avec elle : une seule ligne.
    const parent = number.slice(0, number.lastIndexOf('.'))
    if (parent && cur.has(parent) && !off.has(parent)) continue
    const subtree = flattenTree([c])
    // `countFor` compte DÉJÀ le nœud et ses descendants (cf. `dossier-selectors`) : sommer sur le
    // sous-arbre gonflerait le nombre affiché. Le sous-arbre sert à la décision `savedAt`.
    const docCount = countFor(c)
    const validated = subtree.some((n) => !!n.savedAt)
    if (docCount > 0 || validated) {
      keeps.push({
        kind: 'keep',
        number,
        label: c.label,
        docCount,
        keepReason: docCount > 0 ? 'documents' : 'validated',
      })
    } else {
      drops.push({ kind: 'drop', number, label: c.label, docCount: 0 })
    }
  }

  const byNum = (a: MergeLine, b: MergeLine) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  return [...adds.sort(byNum), ...relabels.sort(byNum), ...drops.sort(byNum), ...keeps.sort(byNum)]
}

/**
 * Applique la SÉLECTION à l'arbre du dossier. Le résultat suit l'ordre officiel, mais chaque nœud
 * conservé garde son identité (`id`), sa validation (`savedAt`) et ses sous-sections propres.
 *
 * Tout ce qui n'est pas coché reste dans l'état où l'utilisateur l'a laissé — y compris une section
 * « plus exigée » qu'il a choisi de garder, ou qu'il n'avait pas le droit de retirer.
 */
export function applyMergePlan(
  current: CtdNodeDef[],
  official: CtdNodeDef[],
  chosen: Set<string>,
  countFor: (node: CtdNodeDef) => number,
): CtdNodeDef[] {
  /**
   * LA garantie, ici et pas seulement dans le plan affiché : une section ne peut quitter le dossier
   * que si elle est NUMÉROTÉE, VIDE et NON VALIDÉE — vérifié sur l'arbre AU MOMENT D'ÉCRIRE.
   *
   * Le plan est calculé pour l'affichage ; entre l'ouverture de la boîte et le clic, un collègue
   * (CS1) ou une synchro peut avoir déposé une pièce. Une sélection d'un tour de retard supprimerait
   * alors une section porteuse : la pièce resterait en base, rattachée à un numéro absent de
   * l'arbre — invisible dans le dossier ET absente du PDF compilé (bloquant B1 de la revue).
   */
  const droppable = (c: CtdNodeDef): boolean =>
    !!c.number && flattenTree([c]).every((n) => countFor(n) === 0 && !n.savedAt)

  const level = (cur: CtdNodeDef[], off: CtdNodeDef[]): CtdNodeDef[] => {
    // On parcourt l'arbre DE L'UTILISATEUR dans SON ordre : il a pu repositionner ses sections
    // (▲▼) et poser ses sections maison à un endroit choisi. Reconstruire le niveau depuis l'ordre
    // officiel réordonnait tout — y compris les pages du PDF — sans qu'aucune ligne ne l'annonce.
    const out: CtdNodeDef[] = []
    for (const c of cur) {
      const o = c.number ? off.find((x) => x.number === c.number) : undefined
      if (!o) {
        if (chosen.has(`drop:${c.number}`) && droppable(c)) continue
        out.push(c)
        continue
      }
      const renamed = chosen.has(`relabel:${c.number}`) && !!o.label && c.label !== o.label
      const kids =
        (c.children?.length ?? 0) > 0 || (o.children?.length ?? 0) > 0
          ? level(c.children ?? [], o.children ?? [])
          : c.children
      out.push({
        ...c,
        ...(renamed ? { label: o.label, ...(o.note ? { note: o.note } : {}) } : {}),
        ...(kids !== undefined ? { children: kids } : {}),
      })
    }

    // Ajouts cochés : insérés à la place que leur donne la structure OFFICIELLE (juste avant le
    // premier frère officiel suivant déjà présent), avec des ids NEUFS et stables.
    for (let i = 0; i < off.length; i++) {
      const o = off[i]!
      if (!chosen.has(`add:${o.number}`)) continue
      if (out.some((x) => x.number === o.number)) continue
      const nextOfficial = new Set(off.slice(i + 1).map((x) => x.number))
      const at = out.findIndex((x) => nextOfficial.has(x.number))
      const node = assignIds([stripIds(o)])[0]!
      if (at === -1) out.push(node)
      else out.splice(at, 0, node)
    }
    return out
  }
  return level(current, official)
}

/**
 * Restreint une sélection au plan COURANT. À appeler juste avant d'appliquer : une case cochée sur
 * un plan périmé (pièce déposée entre-temps, autre onglet, changement de dossier) ne doit ni
 * s'appliquer ni être comptée.
 */
export const sanitizeChosen = (plan: MergeLine[], chosen: Set<string>): Set<string> => {
  const live = new Set(plan.filter((l) => l.kind !== 'keep').map(mergeLineKey))
  return new Set([...chosen].filter((k) => live.has(k)))
}

/** Résumé pour le bouton d'action : nombre de changements RETENUS (jamais les conservations). */
export const chosenCount = (plan: MergeLine[], chosen: Set<string>): number =>
  plan.filter((l) => l.kind !== 'keep' && chosen.has(mergeLineKey(l))).length
