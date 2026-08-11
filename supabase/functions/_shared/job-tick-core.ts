// Décisions du moteur en série — module PUR (aucune API Deno, aucun réseau, aucun client base).
//
// POURQUOI CE FICHIER EXISTE. La première version de `job-tick` gardait toute sa logique de
// décision dans son `index.ts`, donc hors de portée de `deno test`. Quatre défauts y ont survécu à
// un typecheck propre, et trois d'entre eux produisaient un livrable FAUX présenté comme complet :
// une phase qui avance sur une erreur de lecture, une rubrique définitivement bloquée qu'aucun
// mécanisme ne voyait, un rapport qui affirmait « Aucun constat » parce que le tableau des constats
// avait échoué. Tout ce qui DÉCIDE vit désormais ici.

import { REPORT_PART_TIMEOUT_MS } from './report-core.ts'

/** Rubriques d'une phase, telles que la base les compte. */
export interface CompteurPhase {
  /** `queued` encore réclamables (`attempts` sous le plafond). */
  queued: number
  running: number
  /**
   * `queued` que plus RIEN ne peut réclamer : `attempts` au plafond.
   *
   * ⚠️ C'est l'état qui figeait un job pour toujours. `claim_upgrade_sections` les exclut,
   * `next_upgrade_work` les exclut, et le filet ne balayait que `running` — mais le test
   * d'épuisement, lui, les comptait. La phase n'avançait donc jamais, la commande restait
   * `running` à vie, et l'acheteur était verrouillé par la garde anti-double-lancement. Sans un
   * seul log.
   */
  bloquees: number
  failed: number
}

export type VerdictPhase =
  /** La phase est terminée et SAINE : on peut créer la suivante. */
  | { avance: true }
  /** Du travail reste en cours ou en file : ne rien faire, la prochaine vague s'en charge. */
  | { avance: false; raison: 'en_cours' }
  /** Des rubriques ne sont plus réclamables : le filet doit les trancher, pas le tick. */
  | { avance: false; raison: 'bloquee' }
  /** Des rubriques ont définitivement échoué : le job est en échec, il n'avance pas. */
  | { avance: false; raison: 'echec' }

/**
 * Une phase n'avance que si elle est terminée ET saine.
 *
 * ⚠️ **Le point le plus important du lot.** Laisser passer une phase qui porte des rubriques en
 * échec, c'est livrer un dossier amputé en le déclarant complet — et sur la revue, c'est pire que
 * l'amputation : si le tableau `findings` a échoué, l'appel des recommandations reçoit « aucun
 * constat » et le rapport écrit « Aucun. » sous *Constats*. Une AFFIRMATION fausse, dans un
 * livrable payé. C'est exactement le défaut corrigé en `d224665`, et `generateReport` refuse pour
 * cette raison — mais le worker appelle `generateReportPart` directement et contourne ce refus.
 * Le refus doit donc exister ICI.
 */
export function jugerPhase(c: CompteurPhase): VerdictPhase {
  if (c.queued > 0 || c.running > 0) return { avance: false, raison: 'en_cours' }
  if (c.bloquees > 0) return { avance: false, raison: 'bloquee' }
  if (c.failed > 0) return { avance: false, raison: 'echec' }
  return { avance: true }
}

/**
 * Un job a-t-il seulement commencé ? **Rien ne doit le faire avancer avant sa porte.**
 *
 * ⚠️ Le défaut que cette garde ferme était sur le chemin NOMINAL, et il coûtait la commande.
 * `order-upload-url` crée la ligne `upgrade_jobs` au moment où il **signe l'URL de dépôt** — donc
 * bien avant que l'acheteur ne franchisse la porte de recevabilité. Entre les deux, son navigateur
 * lit le PDF : quelques secondes sur une couche texte, plusieurs MINUTES sur un scan océrisé. Le
 * cron, lui, frappe toutes les 30 s.
 *
 * Sans cette garde, `compterPhase` rendait quatre zéros sur ce job vide, `jugerPhase` répondait
 * « avance », et le tick le promenait de `conformity` à `translation` (avec `sections_total: 0`)
 * puis à `report`, où il mettait en file les trois tableaux de la revue sur un job **sans corpus**.
 * Ils échouaient. L'acheteur franchissait enfin la porte, 34 rubriques réelles partaient et étaient
 * facturées (~1,2 $), puis la phase `report` retrouvait les trois échecs hérités et la commande
 * finissait en `failed`. **Payé, facturé, aucun livrable.**
 *
 * ⚠️ **La garde porte sur `started_at`, JAMAIS sur « zéro rubrique ».** Refuser d'avancer une phase
 * vide paraît plus simple et serait un blocage définitif : quand toutes les rubriques d'un document
 * ressortent `missing`, rien n'est à traduire, la phase `translation` a légitimement zéro ligne —
 * et elle DOIT avancer jusqu'à la revue. C'est la distinction entre « pas encore commencé » et
 * « terminé sans rien produire », et seul `started_at` la porte.
 */
export const jobLance = (job: { started_at?: string | null }): boolean => Boolean(job.started_at)

/** L'enchaînement des passes. `null` = le job est terminé. */
export const PHASE_SUIVANTE: Record<string, string | null> = {
  conformity: 'translation',
  translation: 'report',
  report: null,
}

/**
 * Raisons d'échec DÉTERMINISTES : rejouer ne peut pas changer le verdict, et coûterait un appel.
 *
 * ⚠️ La version précédente décidait sur un `RegExp` appliqué au MESSAGE (`/délai|timeout|abort/i`).
 * Cinq modules peuvent reformuler ces messages, et `toPolicyError` réinjecte tel quel le texte
 * ANGLAIS du fournisseur : un « Request timed out » ne matchait pas `/timeout/`… en français, donc
 * l'invariant « un timeout ne se rejoue JAMAIS » sautait, et l'appel — déjà facturé, déjà invisible
 * dans nos compteurs — était repayé jusqu'à trois fois. On décide sur le TYPE, jamais sur la prose.
 */
const RAISONS_DEFINITIVES: ReadonlySet<string> = new Set([
  // AnthropicOutputError
  'timeout',
  'truncated',
  'refusal',
  'schema_required',
  'bad_cache_breakpoint',
  // SectionOutputError
  'invalid_json',
  'invalid_shape',
  'invalid_status',
  'unknown_section',
  'empty_enum',
  'misrouted',
])

/** Lit la `reason` portée par l'erreur, ou par sa cause (l'enrobage de la revue en pose une). */
function raisonDe(e: unknown): string | null {
  for (const candidat of [e, (e as { cause?: unknown })?.cause]) {
    const r = (candidat as { reason?: unknown })?.reason
    if (typeof r === 'string') return r
  }
  return null
}

/** Plafond de réclamations d'une rubrique — aligné sur `claim_upgrade_sections` et
 * `next_upgrade_work` (`attempts < 3` dans les deux, `0084`). */
export const MAX_TENTATIVES_RUBRIQUE = 3

/**
 * Que devient une rubrique qui vient d'échouer ? `failed` (définitif) ou `queued` (rejouable).
 *
 * `attempts` est incrémenté à la RÉCLAMATION : la valeur reçue ici compte donc déjà l'essai qui
 * vient d'échouer.
 */
export function classerEchec(
  e: unknown,
  attempts: number,
  max = MAX_TENTATIVES_RUBRIQUE,
): 'failed' | 'queued' {
  const raison = raisonDe(e)
  if (raison && RAISONS_DEFINITIVES.has(raison)) return 'failed'
  return attempts >= max ? 'failed' : 'queued'
}

/**
 * Relances AUTOMATIQUES d'une phase en échec, avant l'échec terminal.
 *
 * ⚠️ Décision CEO 2026-08-11, payée à la recette : **l'acheteur n'est jamais le mécanisme de
 * reprise.** La première version marquait la commande `failed` au premier échec de phase et
 * l'écran demandait d'écrire au support — pendant que la relance, elle, n'était qu'une chirurgie
 * SQL que le serveur savait faire tout seul. Désormais il la fait : les rubriques échouées de la
 * phase repartent en file, sans un mot à l'acheteur, qui ne voit qu'une barre de progression un
 * peu plus lente (le décompte affiché est calibré pour couvrir ces relances).
 *
 * Pourquoi rejouer peut réussir là où trois tentatives ont échoué : les « raisons définitives »
 * ne le sont que POUR UN TICK. Un timeout rejoué dans la même fenêtre n'a aucune chance ; rejoué
 * dans une invocation NEUVE, il dispose de la fenêtre entière — c'est exactement la relance
 * support qui a terminé la commande de la recette. Borné à deux : au-delà, l'échec est
 * structurel (document, gabarit, panne fournisseur durable), et le troisième verdict devient
 * terminal — commande `failed`, alerte support, écran honnête. Le recours humain reste le
 * DERNIER étage, plus jamais le premier.
 */
export const MAX_RELANCES_JOB = 2

/** Le job a-t-il encore droit à une relance automatique de sa phase ? */
export const doitRelancer = (relances: number): boolean => relances < MAX_RELANCES_JOB

/**
 * Tranche minimale AVANT de lancer une rubrique, par phase.
 *
 * ⚠️ Une valeur unique de 12 s passait SOUS les deux seuils qu'elle devait protéger :
 *  • en conformité, sous le pire cas mesuré d'une rubrique (22 s) — l'appel partait, expirait, et
 *    l'invariant « un timeout ne se rejoue jamais » en faisait une rubrique perdue ET payée ;
 *  • en revue, sous le plancher de `generateReportPart` (15 s), qui lève AVANT tout appel — la
 *    tentative était donc brûlée pour rien, et trois fois de suite cassaient le rapport.
 *
 * ⚠️ Et 20 s en revue reproduisaient le piège de la conformité UN CRAN plus haut (recette
 * 2026-08-10) : un tableau peut légitimement consommer son plafond entier, et un timeout est
 * DÉFINITIF — un tableau lancé en fin de fenêtre expirait en échec terminal au lieu d'attendre le
 * tick suivant, à 30 s de là. La tranche de revue vaut donc LE PLAFOND, structurellement : elle ne
 * peut plus repasser dessous sans que ce fichier cesse de compiler.
 */
export function trancheMinMs(phase: string): number {
  if (phase === 'conformity') return 25_000
  if (phase === 'report') return REPORT_PART_TIMEOUT_MS
  return 18_000
}

/**
 * Faut-il préchauffer le cache de préfixe pour cette vague ?
 *
 * Le premier appel écrit le préfixe (1,25×), les suivants le relisent (0,1×). Lancer la vague
 * entière d'emblée fait payer l'écriture à chacun.
 *
 * ⚠️ La revue partage un préfixe elle AUSSI depuis son découpage — pièce et préambule sont
 * communs à ses quatre appels. La restreindre à la conformité faisait écrire trois fois un préfixe
 * de ~16 700 jetons au lieu d'une : ~38 000 jetons d'entrée facturés en trop par run, ce qui
 * annulait le bénéfice du découpage. Seule la TRADUCTION n'a rien à partager — chaque rubrique y
 * porte son propre contenu (`cacheRead` = 0 sur les 25 mesurées).
 */
export function doitPrechauffer(phase: string, dejaAbouties: number, tailleVague: number): boolean {
  if (phase === 'translation') return false
  return dejaAbouties === 0 && tailleVague > 1
}

/**
 * Ordre de service d'une vague de revue : le tableau le plus COURT préchauffe.
 *
 * `order by created_at` ne suffit pas — les quatre lignes naissent d'un même `upsert`, donc à
 * l'horodatage de transaction, donc identiques. L'ordre était laissé au hasard du plan
 * d'exécution, et c'est `findings` (le plus long) qui pouvait se retrouver à préchauffer : le
 * double de latence pour exactement le même cache.
 */
export const ORDRE_REVUE: readonly string[] = [
  'terminology',
  'relocations',
  'findings',
  'recommendations',
]

export function trierVagueRevue<T extends { section_id: string }>(vague: T[]): T[] {
  const rang = (s: string) => {
    const i = ORDRE_REVUE.indexOf(s)
    return i === -1 ? ORDRE_REVUE.length : i
  }
  return [...vague].sort((a, b) => rang(a.section_id) - rang(b.section_id))
}
