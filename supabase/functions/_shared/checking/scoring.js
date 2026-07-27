/* FICHIER GENERE par web/scripts/build-checking-bareme.mjs a partir de
 * landing/checking/scoring.js — NE PAS EDITER A LA MAIN.
 * Modifier la source, puis lancer `npm run build:checking-bareme` (depuis web/).
 * La CI regenere et exige zero diff : la copie ne peut pas deriver de la source. */
/**
 * Checking Standard — MOTEUR DE NOTATION (fonctions pures, zéro DOM, zéro i18n).
 *
 * Le moteur ne rend AUCUN texte : il renvoie des identifiants et des nombres. C'est ce qui le
 * rend testable indépendamment de la langue et réutilisable côté serveur (Edge `checking-report`
 * recalcule le score au lieu de faire confiance au client — le navigateur n'est pas une source).
 *
 * Invariant central : le score et les verrous sont DEUX dimensions distinctes. Un dossier peut
 * afficher 90/100 et rester bloqué par un seul verrou de réception manquant (Annexe IV,
 * Règl. 04/2020). Ne jamais dériver le verdict du seul score.
 */

import { AXES, GATES, ITEMS_ENR, ITEMS_REN, VAL, BAREME_VERSION, optionsFor } from './referentiel.js'

export { BAREME_VERSION }

/** Vocabulaire global des réponses. Ne PAS s'en servir pour valider : chaque item n'accepte que
 *  les clés de SES options (cf. `allowedAnswers`) — « non applicable » n'existe que sur les
 *  exigences conditionnelles. */
export const ANSWER_KEYS = ['ok', 'nc', 'ko', 'na']

/**
 * Réponses réellement acceptées par un item donné.
 *
 * Règle de sécurité : `na` sort l'item du dénominateur du score. L'accepter sur un item qui ne
 * le propose pas laisserait forger un « 100/100 · prêt pour le dépôt » en répondant `na` à tout
 * sauf aux trois verrous — rapport faux sous notre marque, et statistiques agrégées polluées.
 * @param {import('./referentiel.js').Item} item
 * @returns {Set<string>}
 */
export function allowedAnswers(item) {
  return new Set(optionsFor(item).map((o) => o.k))
}

/** Opérations et types de produit acceptés. */
export const OPERATIONS = ['enr', 'ren']
export const PRODUCT_TYPES = ['spec', 'gen', 'vac']

/** Seuils de verdict — une seule définition, partagée par la page et le rapport e-mail. */
export const THRESHOLD_READY = 85
export const THRESHOLD_PARTIAL = 60

/**
 * Questionnaire applicable au contexte. Les items marqués `only` ne sont posés que pour les
 * types de produit concernés (ex. dissolution comparée : génériques uniquement) — poser une
 * question hors sujet fausse le score autant qu'en oublier une.
 * @param {{op?: string, type?: string}} ctx
 * @returns {import('./referentiel.js').Item[]}
 */
export function buildFlow(ctx) {
  const op = OPERATIONS.includes(ctx?.op ?? '') ? ctx.op : 'enr'
  const type = PRODUCT_TYPES.includes(ctx?.type ?? '') ? ctx.type : 'spec'
  const items = op === 'ren' ? ITEMS_REN : ITEMS_ENR
  return items.filter((it) => !it.only || it.only.includes(type))
}

/**
 * Verdict — dérivé des verrous D'ABORD, du score ensuite.
 * @param {{score: number, gateFail: boolean}} r
 * @returns {'gate_fail'|'ready'|'incomplete'|'not_ready'}
 */
export function verdictOf({ score, gateFail }) {
  if (gateFail) return 'gate_fail'
  if (score >= THRESHOLD_READY) return 'ready'
  if (score >= THRESHOLD_PARTIAL) return 'incomplete'
  return 'not_ready'
}

/**
 * Calcule le résultat complet à partir des réponses.
 *
 * Règles de calcul :
 *   • `na` (non applicable) sort l'item du dénominateur — il ne pénalise ni ne récompense. Il
 *     n'est honoré que sur les items qui l'OFFRENT (`allowedAnswers`) : ailleurs il vaut `ko`.
 *   • une réponse absente, inconnue, ou non proposée par l'item vaut `ko` (0) : un dossier
 *     incomplet ne se note pas mieux qu'un dossier déclaré incomplet. Fail-safe, jamais fail-open.
 *   • un verrou n'est satisfait que sur `ok` strict : « présent mais non conforme » ne passe
 *     pas la réception.
 *   • le plan de préparation est trié par priorité : verrous d'abord (+100), puis poids.
 *
 * @param {{op?: string, type?: string, answers?: Record<string, string>}} input
 * @returns {{
 *   version: string, score: number, answered: number, total: number,
 *   answers: Record<string, string>,
 *   axes: {key: string, pct: number}[],
 *   gates: {key: string, ok: boolean}[], gateOk: number, gateTotal: number, gateFail: boolean,
 *   verdict: 'gate_fail'|'ready'|'incomplete'|'not_ready',
 *   missing: {id: string, kind: 'ko'|'nc', weight: number, tpl?: string}[],
 *   flags: string[], complete: boolean
 * }}
 */
export function computeResult(input) {
  const flow = buildFlow(input ?? {})
  const answers = input?.answers && typeof input.answers === 'object' ? input.answers : {}

  let earned = 0
  let possible = 0
  let answered = 0
  /** @type {Record<string, {e: number, p: number}>} */
  const axAcc = {}
  for (const key of Object.keys(AXES)) axAcc[key] = { e: 0, p: 0 }
  /** @type {Record<string, boolean>} */
  const gateState = {}
  /** @type {{id: string, kind: 'ko'|'nc', weight: number, tpl?: string}[]} */
  const missing = []
  /** @type {string[]} */
  const flags = []
  /** @type {Record<string, string>} */
  const normalized = {}

  for (const it of flow) {
    const raw = answers[it.id]
    const ok = allowedAnswers(it).has(raw)
    const a = ok ? raw : 'ko'
    if (ok) answered++
    normalized[it.id] = a

    // Un verrou se juge même sur une réponse manquante : absence de preuve = verrou fermé.
    if (it.gate) gateState[it.gate] = a === 'ok'

    if (a === 'na') continue

    const v = VAL[a] ?? 0
    earned += v * it.w
    possible += it.w
    const acc = axAcc[it.axis]
    if (acc) {
      acc.e += v * it.w
      acc.p += it.w
    }

    if (a === 'ko' || a === 'nc') {
      missing.push({ id: it.id, kind: a, weight: it.w + (it.gate ? 100 : 0), ...(it.tpl ? { tpl: it.tpl } : {}) })
    }
    if (it.special === 'timing' && (a === 'nc' || a === 'ko')) flags.push(`timing_${a}`)
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0
  const gates = Object.keys(GATES)
    .filter((k) => k in gateState)
    .map((k) => ({ key: k, ok: gateState[k] === true }))
  const gateOk = gates.filter((g) => g.ok).length
  const gateFail = gates.some((g) => !g.ok)

  missing.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))

  return {
    version: BAREME_VERSION,
    score,
    answered,
    total: flow.length,
    // Instantané des réponses RETENUES (les valeurs écartées sont normalisées en `ko`) : le rendu
    // du résultat s'appuie dessus au lieu de relire l'état vivant de la page, qui a pu bouger.
    answers: normalized,
    axes: Object.keys(AXES)
      .filter((k) => (axAcc[k]?.p ?? 0) > 0)
      .map((k) => ({ key: k, pct: Math.round((axAcc[k].e / axAcc[k].p) * 100) })),
    gates,
    gateOk,
    gateTotal: gates.length,
    gateFail,
    verdict: verdictOf({ score, gateFail }),
    missing,
    flags,
    complete: !gateFail && missing.length === 0,
  }
}
