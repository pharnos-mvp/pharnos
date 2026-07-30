/**
 * Noyau PUR de la lecture d'un PDF scanné — ni pdf.js, ni tesseract, ni DOM.
 *
 * Deux décisions vivent ici, et toutes deux se paient si elles sont fausses :
 *
 *  1. **Ce document est-il un scan ?** Trop laxiste, on télécharge 8 Mo de reconnaissance pour rien.
 *     Trop strict, on prend un document partiellement scanné pour un document textuel, et les
 *     rubriques dont le contenu vit dans les pages sans texte ressortent « Non fourni » alors que
 *     le document les couvre. La seconde erreur est la pire : elle produit un livrable FAUX.
 *  2. **Que retirer du texte reconstruit ?** Les numéros de page et en-têtes répétés, et ce n'est
 *     pas cosmétique : le moteur interdit d'enjamber un chiffre du corpus de contrôle — pour qu'un
 *     dosage ne le soit pas — donc un numéro de page laissé au milieu du texte rend INTROUVABLE
 *     toute citation à cheval sur deux pages. La rubrique serait rétrogradée alors qu'elle est juste.
 */

/** Provenance déclarée à l'Edge `upgrade` — contrat de `sourceKind`. */
export type SourceKind = 'text' | 'ocr'

/**
 * Caractères en deçà desquels une page est tenue pour SANS texte. Un numéro de page seul en donne
 * 1 à 4, un en-tête courant 30 à 60 : le seuil doit passer au-dessus de l'ornement sans avaler une
 * page de garde ou une page de tableau clairsemée.
 */
export const MIN_CHARS_PER_PAGE = 80

/**
 * Cette page est-elle SANS couche texte exploitable ?
 *
 * ⚠️ La décision se prend PAGE PAR PAGE, jamais sur une proportion à l'échelle du document, et c'est
 * la seule règle qui ne se trompe dans aucun des deux sens :
 *
 *  - un seuil global laissait passer cinq pages-images dans un document de vingt-cinq : elles
 *    contribuaient ZÉRO caractère au corpus, rien ne le signalait, et toute rubrique qui y vivait
 *    ressortait « Non fourni » sur un dossier complet ;
 *  - le même seuil, dans l'autre sens, faisait océriser un RCP de quatre pages parfaitement textuel
 *    à cause d'une page de garde clairsemée — et REMPLAÇAIT un corpus exact par un corpus reconstruit.
 *
 * Page par page, on lit la couche texte là où elle existe et on n'océrise que ce qui manque.
 */
export function isTextlessPage(chars: number): boolean {
  return chars < MIN_CHARS_PER_PAGE
}

/**
 * Nombre de lignes de bord examinées à chaque extrémité d'une page.
 *
 * Quatre et non deux : mesuré sur un scan réel (guide de pharmacovigilance sénégalais), le bloc
 * d'en-tête d'un document officiel occupe quatre à cinq lignes — logotype océrisé, référence
 * documentaire, indice de révision, puis le numéro de page. Une bande de deux lignes laissait passer
 * « Page 6/59 », et un numéro de page laissé dans le corpus rend introuvable toute citation à cheval
 * sur la coupure : le moteur interdit d'enjamber un chiffre du corpus, pour qu'un dosage ne le soit
 * pas. L'exigence de répétition sur 60 % des pages continue de protéger le contenu.
 */
const RUNNING_EDGE_LINES = 4

/** Part de pages portant la même ligne de bord au-delà de laquelle c'est un ornement, pas du contenu. */
const RUNNING_MIN_SHARE = 0.6

/** En deçà, « répété » ne veut rien dire : deux pages qui se ressemblent ne font pas un en-tête. */
const MIN_PAGES_FOR_RUNNING = 3

/**
 * Ligne dont le contenu ENTIER est un libellé de page — « Page 6/59 », « page 6 sur 59 », « p. 12 ».
 *
 * Retirée sans condition de position ni de répétition, et c'est justifié : sur un scan réel, le bloc
 * d'en-tête d'un document officiel s'étale sur cinq lignes et le numéro de page atterrit au milieu,
 * hors de toute bande de bord — constaté sur le guide sénégalais, où « Page 6/59 » survivait à une
 * bande de deux comme de quatre lignes. Le mot « page » suivi d'un nombre et de RIEN d'autre n'est
 * jamais du contenu de rubrique : la reconnaître par ce qu'elle EST vaut mieux que par où elle est.
 *
 * ⚠️ Le mot est EXIGÉ. Une ligne réduite à « 6/59 » resterait ambiguë (proportion, date, dosage) et
 * relève de la règle de position, pas de celle-ci.
 */
const PAGE_LABEL =
  /^[\s\-–—_.·•|([]*(?:page|pg|p\.)\s*\d{1,4}(?:\s*(?:\/|sur|of|de|\||-)\s*\d{1,4})?[\s\-–—_.·•|)\]]*$/i

/**
 * Clé de comparaison d'une ligne de bord, CHIFFRES MASQUÉS.
 *
 * C'est le masquage qui fait tout le travail : « Page 1 sur 30 » et « Page 2 sur 30 » sont la même
 * ligne courante, et un numéro de page nu (« 12 », « — 7 — ») se réduit au même squelette d'une page
 * à l'autre. Sans lui, un pied de page numéroté serait unique à chaque page, donc jamais reconnu.
 *
 * Rend `null` pour une ligne vide ou réduite à de la ponctuation : rien à compter.
 */
function ornamentKey(line: string): string | null {
  const key = line
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—_.·•|]+|[\s\-–—_.·•|]+$/g, '')
    .trim()
    .toLowerCase()
  return key.length === 0 ? null : key
}

/**
 * Retire de chaque page les lignes de BORD qui se répètent d'une page à l'autre : en-têtes courants,
 * pieds de page, folios.
 *
 * ⚠️ **Une ligne n'est retirée que si elle est PROUVÉE ornementale**, et la preuve diffère selon sa
 * nature. C'est le cœur du module, parce que les deux erreurs possibles coûtent la même chose : une
 * donnée effacée du corpus rend introuvable la citation qui la porte, et un folio laissé au milieu du
 * texte rend introuvable toute citation à cheval sur deux pages. Dans les deux cas, une rubrique
 * JUSTE ressort « Non fourni ».
 *
 *  - **Ligne portant des lettres** (« KV-KACIN — RCP », « Page 3 sur 4 ») : preuve = répétition sur
 *    au moins `RUNNING_MIN_SHARE` des pages, en bord de page.
 *  - **Ligne sans lettre** (« 12 », « 140/90 », « 95 % ») : la répétition ne prouve RIEN, puisque le
 *    masquage des chiffres donne la même clé à toutes. Preuve exigée = une suite STRICTEMENT
 *    CROISSANTE d'une page à l'autre — un folio monte, une valeur de tableau non. Et seules les
 *    positions qui ont FORMÉ cette suite sont retirées, jamais les autres lignes de même clé.
 *
 * ⚠️ **Ne fusionne pas les pages.** Le résultat garde une page par entrée : c'est l'appelant qui
 * assemble, et la césure de fin de ligne est recollée côté moteur (`normalizeForEvidence`).
 */
export function stripRunningLines(pages: readonly string[]): string[] {
  if (pages.length < MIN_PAGES_FOR_RUNNING) return [...pages]
  // Le libellé de page se reconnaît seul ; il n'est retiré que sur un document assez long pour que
  // « répété » ait un sens, comme le reste.
  const lines = pages.map((p) => p.split('\n').filter((l) => !PAGE_LABEL.test(l)))

  const byKey = new Map<string, Candidate[]>()
  for (const [page, pageLines] of lines.entries()) {
    const seen = new Set<string>()
    for (const c of candidates(pageLines, page)) {
      // Une clé n'est comptée qu'UNE fois par page : un pied répété trois fois sur la même page ne
      // doit pas peser comme s'il apparaissait sur trois pages.
      if (seen.has(c.key)) continue
      seen.add(c.key)
      const list = byKey.get(c.key)
      if (list) list.push(c)
      else byKey.set(c.key, [c])
    }
  }

  const threshold = pages.length * RUNNING_MIN_SHARE
  /** Positions à retirer, par page. */
  const drop = lines.map(() => new Set<number>())
  for (const [key, found] of byKey) {
    if (found.length < threshold) continue
    const proven = hasLetter(key) ? found : folioRun(found)
    for (const c of proven) drop[c.page]?.add(c.index)
  }

  return lines.map((pageLines, page) => pageLines.filter((_, i) => !drop[page]?.has(i)).join('\n'))
}

interface Candidate {
  page: number
  index: number
  key: string
  /** Valeur numérique de la ligne, pour les lignes sans lettre. */
  value: number
}

const hasLetter = (s: string) => /[a-zà-öø-ÿ]/i.test(s)

/**
 * Les candidates forment-elles un FOLIO ? Rend celles qui composent la suite, ou rien.
 *
 * Strictement croissante d'une page à l'autre : c'est le seul signal qui sépare un folio d'une
 * donnée, puisque le masquage des chiffres les confond. Une valeur répétée (« 250 » au bas de trois
 * pages) ou désordonnée (« 140/90 », « 130/85 », « 120/80 ») n'est PAS un folio, et l'effacer
 * retirerait du corpus une donnée que la citation porte peut-être.
 */
function folioRun(found: readonly Candidate[]): readonly Candidate[] {
  if (found.length < MIN_PAGES_FOR_RUNNING) return []
  const ordered = [...found].sort((a, b) => a.page - b.page)
  const increasing = ordered.every((c, i) => i === 0 || c.value > (ordered[i - 1]?.value ?? 0))
  return increasing ? ordered : []
}

/**
 * Lignes ÉLIGIBLES au statut d'ornement, avec leur position et leur clé.
 *
 * ⚠️ La bande de bord est PROPORTIONNELLE à la page. Une bande fixe de quatre lignes couvre la page
 * ENTIÈRE dès qu'elle en compte huit — ce qui est la norme sur un scan (page de garde, page de
 * tableau, annexe) : il n'y aurait alors plus de corps à protéger, et un contenu répété d'une page à
 * l'autre disparaîtrait entièrement. Un tiers de la page à chaque extrémité, au plus
 * `RUNNING_EDGE_LINES`, laisse toujours un corps intact.
 *
 * Les lignes sans lettre restent en outre limitées à l'extrémité MÊME de la page : un folio est la
 * première ou la dernière ligne, jamais l'avant-dernière.
 */
function candidates(pageLines: readonly string[], page: number): Candidate[] {
  const filled = pageLines.map((_, i) => i).filter((i) => (pageLines[i] ?? '').trim().length > 0)
  const width = Math.max(1, Math.min(RUNNING_EDGE_LINES, Math.floor(filled.length / 3)))
  const band = new Set([...filled.slice(0, width), ...filled.slice(-width)])
  const outer = new Set([filled[0], filled[filled.length - 1]].filter((i) => i !== undefined))
  const out: Candidate[] = []
  for (const i of band) {
    const line = pageLines[i] ?? ''
    const key = ornamentKey(line)
    if (!key) continue
    if (!hasLetter(key) && !outer.has(i)) continue
    out.push({ page, index: i, key, value: Number(line.replace(/\D/g, '')) || 0 })
  }
  return out
}

/**
 * Assemble le corpus de contrôle : ornements retirés, pages séparées par une ligne vide.
 *
 * La séparation par ligne vide n'est pas décorative — sans elle, la dernière ligne d'une page et la
 * première de la suivante se colleraient en un mot inexistant, et une citation qui traverse la
 * coupure deviendrait introuvable.
 */
export function buildControlCorpus(pages: readonly string[]): string {
  return stripRunningLines(pages)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join('\n\n')
}
