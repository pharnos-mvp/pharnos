// deno test — décisions du moteur en série. Aucun réseau, aucune base : tout ce qui DÉCIDE est pur.
import { assertEquals } from 'jsr:@std/assert@1'

import { AnthropicOutputError } from './ai/anthropic.ts'
import { SectionOutputError } from './ai/section-schema.ts'
import { REPORT_PART_TIMEOUT_MS } from './report-core.ts'
import { HttpError } from './retry.ts'
import {
  classerEchec,
  doitPrechauffer,
  doitRelancer,
  jobLance,
  jugerPhase,
  MAX_RELANCES_JOB,
  ORDRE_REVUE,
  PHASE_SUIVANTE,
  trancheMinMs,
  trierVagueRevue,
  type CompteurPhase,
} from './job-tick-core.ts'

const compte = (o: Partial<CompteurPhase> = {}): CompteurPhase => ({
  queued: 0,
  running: 0,
  bloquees: 0,
  failed: 0,
  ...o,
})

/* ─────────────────────────────── L'avancement de phase ─────────────────────────────────────── */

Deno.test('phase : elle n’avance QUE terminée et saine', () => {
  assertEquals(jugerPhase(compte()), { avance: true })
  assertEquals(jugerPhase(compte({ queued: 1 })), { avance: false, raison: 'en_cours' })
  assertEquals(jugerPhase(compte({ running: 1 })), { avance: false, raison: 'en_cours' })
})

Deno.test('phase : une rubrique en ÉCHEC bloque la transition', () => {
  // ⚠️ Le défaut le plus grave du lot. Laisser passer, c'est livrer un dossier amputé en le
  // déclarant complet — et sur la revue, si `findings` a échoué, l'appel des recommandations reçoit
  // « aucun constat » et le rapport écrit « Aucun. » sous Constats : une AFFIRMATION fausse dans un
  // livrable payé. `generateReport` refuse pour cette raison ; le worker l'appelle par morceaux et
  // contournait ce refus.
  assertEquals(jugerPhase(compte({ failed: 1 })), { avance: false, raison: 'echec' })
  // Même avec 33 rubriques réussies sur 34.
  assertEquals(jugerPhase(compte({ failed: 1, queued: 0, running: 0 })), {
    avance: false,
    raison: 'echec',
  })
})

Deno.test('phase : une rubrique PLUS RÉCLAMABLE est distinguée d’un échec', () => {
  // Elle figeait le job pour toujours : `claim` l'exclut, `next_upgrade_work` l'exclut, le filet ne
  // balayait que `running` — mais le test d'épuisement la comptait. La nommer, c'est pouvoir la
  // trancher (le filet la passe `failed`) au lieu de tourner en rond sans un seul log.
  assertEquals(jugerPhase(compte({ bloquees: 1 })), { avance: false, raison: 'bloquee' })
  // `bloquee` prime sur `echec` : c'est le diagnostic actionnable des deux.
  assertEquals(jugerPhase(compte({ bloquees: 1, failed: 2 })), { avance: false, raison: 'bloquee' })
  // Et le travail en cours prime sur tout : rien n'est encore joué.
  assertEquals(jugerPhase(compte({ running: 1, bloquees: 1, failed: 1 })), {
    avance: false,
    raison: 'en_cours',
  })
})

Deno.test('phase : l’enchaînement des passes se termine', () => {
  assertEquals(PHASE_SUIVANTE.conformity, 'translation')
  assertEquals(PHASE_SUIVANTE.translation, 'report')
  assertEquals(PHASE_SUIVANTE.report, null)
})

/* ──────────────────────────────── La classification des échecs ─────────────────────────────── */

Deno.test('échec : un TIMEOUT ne se rejoue jamais, quelle que soit la langue du message', () => {
  // ⚠️ La version précédente décidait sur `/délai|timeout|abort/i` appliqué au message. Or
  // `toPolicyError` réinjecte le texte ANGLAIS du fournisseur : « Request timed out » ne matchait
  // pas, l'appel — déjà facturé et invisible dans nos compteurs — était repayé jusqu'à trois fois.
  assertEquals(classerEchec(new AnthropicOutputError('timeout', 'Request timed out'), 1), 'failed')
  assertEquals(classerEchec(new AnthropicOutputError('timeout', 'peu importe le texte'), 1), 'failed')
})

Deno.test('échec : les sorties inexploitables sont DÉFINITIVES dès la première fois', () => {
  for (const raison of ['truncated', 'refusal', 'invalid_json', 'invalid_shape', 'misrouted']) {
    const e = raison === 'truncated' || raison === 'refusal'
      ? new AnthropicOutputError(raison, 'x')
      : new SectionOutputError(raison, 'x')
    assertEquals(classerEchec(e, 1), 'failed', raison)
  }
})

Deno.test('échec : une panne TRANSITOIRE se rejoue, jusqu’au plafond', () => {
  // Un 503 ou une coupure réseau n'a rien de déterministe : la rejouer est le bon réflexe, et c'est
  // le plafond `attempts` — non le type — qui l'arrête.
  assertEquals(classerEchec(new HttpError(503, 'Anthropic : réseau'), 1), 'queued')
  assertEquals(classerEchec(new HttpError(503, 'Anthropic : réseau'), 2), 'queued')
  assertEquals(classerEchec(new HttpError(503, 'Anthropic : réseau'), 3), 'failed')
  assertEquals(classerEchec(new Error('boom'), 1), 'queued')
  assertEquals(classerEchec(new Error('boom'), 3), 'failed')
})

Deno.test('échec : la raison portée par la CAUSE est lue aussi', () => {
  // La revue enrobe : `refuseIfIncomplete` lève une `Error` qui porte l'originale en `cause`.
  // Ne lire que le premier niveau ferait rejouer un JSON illisible.
  const enrobee = new Error('revue incomplète', {
    cause: new SectionOutputError('invalid_json', 'rapport : JSON illisible'),
  })
  assertEquals(classerEchec(enrobee, 1), 'failed')
})

/* ───────────────────────────────── Relances automatiques ───────────────────────────────────── */

Deno.test('relance : le serveur rejoue AVANT de déclarer l’échec, borné, jamais l’acheteur', () => {
  // Décision CEO 2026-08-11 : au premier échec de phase, la première version demandait à
  // l'acheteur d'écrire au support — pendant que la relance n'était qu'une remise en file que le
  // serveur savait faire seul. Deux relances automatiques, puis seulement l'échec terminal.
  assertEquals(doitRelancer(0), true)
  assertEquals(doitRelancer(1), true)
  assertEquals(doitRelancer(MAX_RELANCES_JOB), false)
  // Un compteur corrompu (négatif) relance encore ; un compteur au-delà du plafond n'insiste pas.
  assertEquals(doitRelancer(MAX_RELANCES_JOB + 5), false)
})

/* ─────────────────────────── Tranches, préchauffage, ordre de vague ────────────────────────── */

Deno.test('tranche : chaque phase reste AU-DESSUS du seuil qu’elle doit protéger', () => {
  // Conformité : le pire cas mesuré d'une rubrique est 22 s. En deçà, l'appel part, expire, et
  // l'invariant « un timeout ne se rejoue jamais » en fait une rubrique perdue ET payée.
  assertEquals(trancheMinMs('conformity') > 22_000, true)
  // Revue : un tableau peut consommer son plafond ENTIER (recette 2026-08-10 — `relocations` a
  // dépassé les 60 s d'alors), et un timeout est définitif. La tranche vaut donc le plafond :
  // un tableau lancé sans la piste entière attendrait le tick suivant au lieu de mourir.
  assertEquals(trancheMinMs('report'), REPORT_PART_TIMEOUT_MS)
  // Et le plafond doit TENIR dans la fenêtre d'une invocation : budget 115 s (mur Edge 150 s
  // − 35 s de prélude, `BUDGET_INVOCATION_MS`) moins la marge d'écriture de 8 s
  // (`MARGE_ECRITURE_MS`, job-tick/index.ts) — sinon plus aucune ligne de revue n'est jamais
  // réclamée et le rapport ne démarre pas.
  assertEquals(REPORT_PART_TIMEOUT_MS + 8_000 <= 150_000 - 35_000, true)
  assertEquals(trancheMinMs('translation') > 15_000, true)
})

Deno.test('préchauffage : la REVUE aussi, la traduction jamais', () => {
  // ⚠️ Restreint à la conformité, il faisait écrire TROIS fois un préfixe de ~16 700 jetons au lieu
  // d'une : ~38 000 jetons d'entrée facturés en trop par run, ce qui annulait le bénéfice du
  // découpage de la revue.
  assertEquals(doitPrechauffer('conformity', 0, 6), true)
  assertEquals(doitPrechauffer('report', 0, 3), true)
  // La traduction n'a aucun préfixe commun : chaque rubrique porte son propre contenu.
  assertEquals(doitPrechauffer('translation', 0, 6), false)
  // Le préfixe est déjà écrit dès qu'une rubrique a abouti : le répéter ne ferait que rallonger.
  assertEquals(doitPrechauffer('conformity', 1, 6), false)
  // Un seul item : rien à préchauffer pour personne.
  assertEquals(doitPrechauffer('report', 0, 1), false)
})

Deno.test('vague de revue : le tableau le plus COURT part en premier', () => {
  // `order by created_at` ne départage pas : les quatre lignes naissent d'un même `upsert`, donc au
  // même horodatage de transaction. L'ordre revenait au hasard du plan d'exécution, et `findings`
  // — le plus long — pouvait préchauffer : le double de latence pour le même cache.
  const melange = [
    { section_id: 'findings' },
    { section_id: 'recommendations' },
    { section_id: 'terminology' },
    { section_id: 'relocations' },
  ]
  assertEquals(trierVagueRevue(melange).map((v) => v.section_id), [...ORDRE_REVUE])
  // Un identifiant inconnu ne disparaît pas : il passe en queue plutôt que d'être évaporé.
  const avecInconnu = [{ section_id: 'zzz' }, { section_id: 'terminology' }]
  assertEquals(trierVagueRevue(avecInconnu).map((v) => v.section_id), ['terminology', 'zzz'])
})

/* ────────────────────────── Un job n'avance pas avant sa porte ─────────────────────────────── */

Deno.test("phase : un job JAMAIS LANCÉ n'a aucune phase à terminer", () => {
  // ⚠️ Le défaut le plus coûteux du lot, et il était sur le chemin NOMINAL. `order-upload-url` crée
  // la ligne du job quand il SIGNE l'URL de dépôt — donc avant la porte. Entre les deux, le
  // navigateur lit le PDF : des minutes sur un scan. Le cron frappe toutes les 30 s. Le tick
  // promenait ce job vide jusqu'à la revue, dont les trois tableaux partaient sans corpus et
  // échouaient ; la commande finissait en `failed` APRÈS avoir été facturée.
  assertEquals(jobLance({ started_at: null }), false)
  assertEquals(jobLance({}), false)
  assertEquals(jobLance({ started_at: '2026-08-06T10:00:00.000Z' }), true)
})

Deno.test('phase : une phase VIDE mais lancée avance — la garde porte sur `started_at`', () => {
  // ⚠️ Le piège du correctif « refuser d'avancer une phase à zéro rubrique », qui paraît plus simple
  // et serait un BLOCAGE DÉFINITIF : quand toutes les rubriques d'un document ressortent `missing`,
  // rien n'est à traduire, la phase `translation` a légitimement zéro ligne — et elle DOIT avancer
  // jusqu'à la revue. « Pas encore commencé » et « terminé sans rien produire » sont deux états
  // différents, et seul `started_at` les distingue.
  assertEquals(jugerPhase(compte()), { avance: true })
  assertEquals(jobLance({ started_at: '2026-08-06T10:00:00.000Z' }), true)
})

