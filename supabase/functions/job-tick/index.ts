// Edge Function `job-tick` — le moteur en série (U4). Une invocation sert PLUSIEURS vagues.
//
// Le mur n'est pas le CPU : les 60 appels du moteur sont de l'ATTENTE, le calcul y est négligeable.
// C'est le wall clock de 150 s par invocation. Une orchestration de 5,3 minutes n'y rentre pas ;
// elle rentre en vagues de 6, dont la plus lente mesurée tient en 48,3 s.
//
// ⚠️ L'invocation BOUCLE tant qu'il lui reste du temps. Une vague par invocation aurait ajouté la
// latence du planificateur entre chaque : à 30 s de période et ~14 vagues par commande, sept
// minutes d'attente pure venaient s'ajouter aux 5,3 minutes de travail réel. `pg_cron` n'est que
// le DÉMARREUR et le filet ; il ne cadence pas le produit.
//
// TROIS CONTRATS, tous issus de la mesure et non du plan (§ « Ce que U0 impose aux lots suivants ») :
//   1. **Une vague = 6**, et l'état vit en base — jamais en mémoire d'un isolat qu'on peut tuer.
//   2. **L'état s'écrit après CHAQUE rubrique** : le premier run du banc a perdu 59 appels PAYÉS
//      sur un dépassement en passe 3. La granularité de la sauvegarde est celle de la DÉPENSE.
//   3. **Préchauffage sur la première vague d'une phase à préfixe partagé** — conformité ET revue,
//      jamais la traduction (chaque rubrique y porte son propre contenu).
//
// Sécurité : `verify_jwt = false` (l'appelant est `pg_cron`), authentifié par un secret partagé
// comparé au HASH rendu par `upgrade_tick_secret_hash()` — le secret ne sort JAMAIS de la base.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

import { prepareSource } from '../_shared/ai/evidence.ts'
import { EDGE_WALL_CLOCK_MS } from '../_shared/ai/limits.ts'
import { conformitySystem, reviewSystem, translationSystem } from '../_shared/ai/personas.ts'
import { boundedMap } from '../_shared/ai/pool.ts'
import { generateParts, type Part } from '../_shared/ai/provider.ts'

/**
 * Le générateur remis au moteur, fournisseur ÉPINGLÉ — une seule définition pour toutes les passes.
 *
 * ⚠️ Le moteur par rubrique vit en sortie structurée (`jsonSchema`) de bout en bout, et seul
 * Anthropic la supporte (`vertex.ts` n'a pas de `responseSchema` — PLAN-MOTEUR-IA §3.2). Sans
 * épinglage, le fournisseur retombe sur l'env `AI_PROVIDER` : une commande PAYÉE dépend alors d'un
 * réglage global posé pour d'autres surfaces. C'est arrivé (recette du 2026-08-10) — `vertex` en
 * env, 34 rubriques en échec après paiement, pendant que le banc passait parce qu'il épingle.
 */
const generateAnthropic: typeof generateParts = (parts, opts = {}) =>
  generateParts(parts, { ...opts, provider: 'anthropic' })
import { findRubric } from '../_shared/ai/section-schema.ts'
import { CONFORMITY_SPECS, type ConformityDocType, DOC_SHORT, flattenRubrics } from '../_shared/conformity-specs.ts'
import {
  classerEchec,
  doitPrechauffer,
  doitRelancer,
  jobLance,
  jugerPhase,
  MAX_TENTATIVES_RUBRIQUE,
  PHASE_SUIVANTE,
  trancheMinMs,
  trierVagueRevue,
} from '../_shared/job-tick-core.ts'
import {
  activityContextLine,
  activityLabel,
  analyseDepuisParts,
  assembleDocument,
  type LigneAssemblage,
  produitDepuisRubrique1,
  statsLivrable,
  type StatsLivrable,
} from '../_shared/deliverable-markdown.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { deliveryTokenHash, DOC_TYPES_VENDABLES, newDeliveryToken } from '../_shared/orders-core.ts'
import {
  generateReportPart,
  pruneUnverifiable,
  renderReportMarkdown,
  REPORT_PARTS,
  type ReportPart,
} from '../_shared/report-core.ts'
import {
  generateSection,
  MISSING_MARKER,
  SECTION_BUDGET_MS,
  type OutputLang,
} from '../_shared/upgrade-section-core.ts'
import { translateSection, TRANSLATE_BUDGET_MS } from '../_shared/translate-section-core.ts'
import { emptyUsage, runWithUsage } from '../_shared/usage.ts'

const BUCKET = 'documents'
/** Vague de 6 : au-delà, la limite de débit du fournisseur annule le gain (cf. `pool.ts`). */
const VAGUE = 6
/**
 * Plafond GLOBAL de rubriques simultanées, toutes commandes confondues. Seul endroit où la montée
 * en charge se règle : sans lui, dix acheteurs lancent 60 appels et le fournisseur nous limite en
 * 429 — chaque rejeu étant lui-même facturé.
 */
const PLAFOND_GLOBAL = 24
/**
 * Budget de l'invocation, volontairement SOUS le mur de 150 s : il reste à télécharger le PDF, à
 * l'encoder et à écrire les résultats. Un budget collé au mur ferait tuer l'invocation juste après
 * le dernier appel payé — le pire moment possible.
 */
const BUDGET_INVOCATION_MS = EDGE_WALL_CLOCK_MS - 35_000
/** Marge exigée pour rouvrir une vague : la tranche de la phase, plus de quoi écrire les résultats. */
const MARGE_ECRITURE_MS = 8_000

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

/** Comparaison à temps constant : un `===` rend le préfixe devinable par le temps de réponse. */
function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

const sha256Hex = async (s: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

interface Job {
  id: string
  order_id: string
  doc_type: string
  source_path: string
  source_kind: 'text' | 'ocr'
  control_text: string | null
  phase: string
  /** Nul tant que la porte de recevabilité n'a pas lancé le travail. */
  started_at: string | null
  lang: OutputLang
  /** Nom du fichier déposé — affichage seul (en-tête du livrable, rapport). */
  source_name?: string | null
  /** Pays de dépôt et activité, portés par la COMMANDE — ils commandent les prompts. */
  country: string | null
  activity: string | null
  /** Relances automatiques déjà consommées (`0092`) — l'acheteur n'est jamais le mécanisme de reprise. */
  relances: number
}

// ⚠️ `started_at` en fait partie, et ce n'est pas décoratif : c'est lui qui distingue un job
// « en attente de sa porte » d'un job en travail. Son absence de cette liste a coûté un bloquant.
const CHAMPS_JOB =
  'id, order_id, doc_type, source_path, source_kind, control_text, phase, started_at, source_name, relances'

/**
 * Prévient QUELQU'UN qu'une commande payée est morte.
 *
 * ⚠️ Sans elle, un échec ne vivait que dans le journal d'une Edge Function que personne ne regarde.
 * L'acheteur, lui, voyait un écran honnête — « écrivez-nous, nous relançons sans nouveau
 * paiement » — mais cette promesse n'engageait que lui : de notre côté, rien ne savait qu'il fallait
 * relancer. Une chaîne qui encaisse avant de travailler doit savoir quand elle a échoué.
 *
 * ⚠️ **N'échoue JAMAIS le tick.** Le job est déjà marqué ; une alerte qui lèverait ferait perdre
 * l'état sur lequel toute la reprise repose. Elle est au mieux, et le dit.
 */
async function alerterEchec(job: Job, raison: string): Promise<void> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const support = Deno.env.get('SUPPORT_EMAIL')
    if (!apiKey || !support) return
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>',
        to: [support],
        subject: `[Upgrade] commande en échec — job ${job.id.slice(0, 8)}`,
        // ⚠️ Aucune donnée personnelle : des identifiants, et la cause technique. Une alerte
        // d'exploitation n'a pas besoin de savoir qui est l'acheteur pour être actionnable.
        text: [
          `Job    : ${job.id}`,
          `Commande : ${job.order_id}`,
          `Phase  : ${job.phase}`,
          `Cause  : ${raison}`,
          '',
          "La commande est en `failed`. L'acheteur voit un écran qui l'invite à écrire au support.",
        ].join('\n'),
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    logJson({ fn: 'job-tick', status: 'alerte_echec_impossible', err: String(e).slice(0, 200) })
  }
}

/* ─────────────────────────────── Avancement de phase ──────────────────────────────────────── */

/**
 * Compte les rubriques d'une phase. Rend `null` sur ERREUR — jamais un compteur à zéro.
 *
 * ⚠️ C'est le correctif du défaut le plus coûteux du lot. La version précédente ignorait l'`error`
 * de la requête : une panne transitoire rendait `count` indéfini, donc `0`, donc « phase épuisée ».
 * Le job traversait alors traduction et revue sans aucune ligne, puis se déclarait `done` et posait
 * `delivered_at` : **l'acheteur recevait un dossier amputé présenté comme complet.** Dans le doute,
 * on n'avance pas.
 */
async function compterPhase(sb: SupabaseClient, jobId: string, phase: string) {
  const { data, error } = await sb
    .from('upgrade_sections')
    .select('status, attempts')
    .eq('job_id', jobId)
    .eq('phase', phase)
  if (error || !data) return null
  const c = { queued: 0, running: 0, bloquees: 0, failed: 0 }
  for (const s of data as { status: string; attempts: number }[]) {
    if (s.status === 'running') c.running++
    // Une `queued` au plafond de tentatives n'est plus réclamable par personne : la compter comme
    // du travail en attente figerait le job pour toujours (cf. `job-tick-core.ts`).
    else if (s.status === 'queued') s.attempts >= 3 ? c.bloquees++ : c.queued++
    else if (s.status === 'failed') c.failed++
  }
  return c
}

/**
 * Marque le job ET la commande en échec — un job cassé doit se distinguer d'un job lent.
 *
 * ⚠️ **L'échec doit être TERMINAL, sinon il ne s'arrête jamais.** Le job ne portait que `error`, sa
 * `phase` restait `conformity` ou `report`, et le prédicat du cron
 * (`exists … upgrade_jobs where phase <> 'done'`) restait donc vrai **à jamais** dès le premier job
 * cassé : `job-tick` était réveillé toutes les 30 secondes pour l'éternité, et à chaque réveil
 * `avancerCeQuiPeut` re-jugeait le même job mort et ré-écrivait les deux mêmes lignes. La table
 * grossissait, les journaux se remplissaient, et ces jobs saturaient la liste de vingt.
 *
 * `phase = 'done'` est déjà autorisé par la contrainte de `0083`, et c'est `error` — non nul — qui
 * distingue un job terminé d'un job abouti. La lecture reste sans ambiguïté pour tout le monde.
 *
 * ⚠️ `.neq('phase', 'done')` : deux ticks porteurs de la même liste ne doivent pas réécrire
 * `finished_at`, sans quoi l'horodatage de fin cesse d'être une mesure.
 */
async function marquerEchec(sb: SupabaseClient, job: Job, raison: string): Promise<void> {
  await sb.from('upgrade_jobs')
    .update({ error: raison.slice(0, 2000), phase: 'done', finished_at: new Date().toISOString() })
    .eq('id', job.id)
    .neq('phase', 'done')
  await sb.from('orders').update({ status: 'failed' }).eq('id', job.order_id).eq('status', 'running')
  // L'échec d'une commande PAYÉE ne doit pas rester entre le journal d'une fonction et personne.
  await alerterEchec(job, raison)
}

/**
 * Relance AUTOMATIQUE de la phase courante — le geste support de la recette, fait par le serveur.
 *
 * L'acheteur ne voit rien : la commande reste `running`, sa page continue d'afficher la barre de
 * progression, et le cron (dont le prédicat couvre `phase <> 'done'`) réinvoque le tick dans les
 * 30 s. Seul le compteur `relances` borne le manège (`doitRelancer`).
 *
 * ⚠️ Le CAS sur `relances` désigne UN SEUL relanceur : deux ticks porteurs du même verdict
 * incrémenteraient sinon deux fois, et brûleraient deux relances pour un seul échec. Le perdant
 * ne remet rien en file — le gagnant l'a déjà fait, et refaire l'update serait sans effet mais
 * raconterait deux relances dans les journaux.
 */
async function relancerPhase(sb: SupabaseClient, job: Job): Promise<boolean> {
  const { data: gagne, error: casErr } = await sb.from('upgrade_jobs')
    .update({ relances: job.relances + 1 })
    .eq('id', job.id)
    .eq('relances', job.relances)
    .neq('phase', 'done')
    .select('id')
  if (casErr || !gagne?.length) return false
  // Rubriques échouées ET bloquées (attempts au plafond) de la phase : retour en file, compteur
  // remis à zéro — la même écriture que la relance support de la recette du 2026-08-10.
  const { error: reqErr } = await sb.from('upgrade_sections')
    .update({ status: 'queued', attempts: 0, error: null, claimed_at: null, finished_at: null })
    .eq('job_id', job.id)
    .eq('phase', job.phase)
    .or(`status.eq.failed,attempts.gte.${MAX_TENTATIVES_RUBRIQUE}`)
  return !reqErr
}

/**
 * Fait avancer d'une phase le job dont la phase courante est terminée ET saine.
 *
 * Les rubriques de la phase suivante ne sont créées qu'ICI : celles de traduction dépendent de ce
 * que la conformité a produit, celles de la revue de ce que la traduction a produit. Les créer
 * d'avance figerait une liste que le travail n'a pas encore déterminée.
 */
async function avancerPhase(sb: SupabaseClient, job: Job, log: Record<string, unknown>): Promise<void> {
  // ⚠️ Un job dont la porte n'est pas franchie n'a AUCUNE phase à terminer : ses zéro rubrique ne
  // sont pas un épuisement (cf. `jobLance`). Sans ce refus, le tick le promenait jusqu'à la revue
  // pendant que l'acheteur lisait encore son PDF, et la commande finissait en échec après avoir
  // été facturée.
  if (!jobLance(job)) return
  const compte = await compterPhase(sb, job.id, job.phase)
  if (!compte) return // lecture douteuse : on ne décide rien.

  const verdict = jugerPhase(compte)
  if (!verdict.avance) {
    if (verdict.raison === 'echec' || verdict.raison === 'bloquee') {
      // ⚠️ Ne JAMAIS avancer sur une phase qui porte un échec. Sur la revue en particulier : si le
      // tableau `findings` a échoué, mettre `recommendations` en file ferait affirmer au modèle
      // « aucun constat n'a été retenu », et le rapport écrirait « Aucun. » sous Constats — une
      // affirmation FAUSSE dans un livrable payé. `generateReport` refuse pour cette raison ; le
      // worker appelle par tableau et contourne ce refus, donc le refus vit ici.
      //
      // Mais un échec de phase n'est TERMINAL qu'après épuisement des relances automatiques :
      // l'acheteur n'est jamais le mécanisme de reprise (décision CEO 2026-08-11, `doitRelancer`).
      if (doitRelancer(job.relances) && (await relancerPhase(sb, job))) {
        logJson({
          ...log,
          status: 'job_relance',
          job: job.id.slice(0, 8),
          phase: job.phase,
          relance: job.relances + 1,
          raison: verdict.raison,
        })
        return
      }
      await marquerEchec(sb, job, `phase ${job.phase} : ${verdict.raison} (${compte.failed} échec(s), ${compte.bloquees} bloquée(s), ${job.relances} relance(s) automatique(s))`)
      logJson({ ...log, status: 'job_echec', job: job.id.slice(0, 8), phase: job.phase, raison: verdict.raison })
    }
    return
  }

  if (job.phase === 'conformity') {
    // Seules les rubriques RENSEIGNÉES se traduisent : une lacune ne se traduit pas, elle se
    // ré-affiche. Créer la ligne quand même gonflerait le décompte montré à l'acheteur.
    const { data: faites, error } = await sb
      .from('upgrade_sections')
      .select('section_id, content')
      .eq('job_id', job.id)
      .eq('phase', 'conformity')
      .eq('status', 'done')
    if (error || !faites) return
    const aTraduire = faites.filter((s) => {
      const c = s.content as { status?: string } | null
      return c?.status && c.status !== 'missing'
    })
    if (aTraduire.length) {
      const { error: insErr } = await sb.from('upgrade_sections').upsert(
        aTraduire.map((s) => ({ job_id: job.id, section_id: s.section_id, phase: 'translation' })),
        { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true },
      )
      if (insErr) return // la file n'est pas prête : on ne bascule pas la phase.
    }
    await sb.from('upgrade_jobs')
      .update({ phase: 'translation', sections_total: aTraduire.length })
      .eq('id', job.id)
      // Un tick porteur d'une liste lue plusieurs secondes plus tôt ne fait pas RÉGRESSER un job
      // que son voisin vient d'avancer : la bascule n'écrit que depuis la phase qu'elle croit.
      .eq('phase', 'conformity')
    logJson({ ...log, status: 'phase', job: job.id.slice(0, 8), vers: 'translation', n: aTraduire.length })
    return
  }

  if (job.phase === 'translation') {
    // La revue occupe QUATRE lignes. `recommendations` dépend des constats : elle n'est mise en
    // file qu'une fois `findings` ABOUTI — pas seulement la phase épuisée.
    const trois = REPORT_PARTS.filter((p) => p !== 'recommendations')
    const { error } = await sb.from('upgrade_sections').upsert(
      trois.map((p) => ({ job_id: job.id, section_id: p, phase: 'report' })),
      { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true },
    )
    if (error) return
    await sb.from('upgrade_jobs')
      .update({ phase: 'report', sections_total: REPORT_PARTS.length })
      .eq('id', job.id)
      .eq('phase', 'translation')
    logJson({ ...log, status: 'phase', job: job.id.slice(0, 8), vers: 'report' })
    return
  }

  if (job.phase === 'report') {
    const { data: reco, error } = await sb
      .from('upgrade_sections')
      .select('id')
      .eq('job_id', job.id)
      .eq('phase', 'report')
      .eq('section_id', 'recommendations')
    if (error || !reco) return
    if (reco.length === 0) {
      // `jugerPhase` a déjà garanti qu'aucun des trois n'a échoué : les constats existent.
      const { error: insErr } = await sb.from('upgrade_sections')
        // Deux ticks concurrents passaient tous deux le compte à zéro : le second `insert` levait
        // un 23505 avalé sans log. Même intention, dite sans erreur.
        .upsert(
          { job_id: job.id, section_id: 'recommendations', phase: 'report' },
          { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true },
        )
      if (!insErr) logJson({ ...log, status: 'phase', job: job.id.slice(0, 8), vers: 'recommendations' })
      return
    }
    if (PHASE_SUIVANTE.report === null) {
      // ── U5 : les trois markdowns naissent ICI, avant que le job ne se déclare terminé ─────────
      //
      // ⚠️ L'ordre est la garantie. Assembler APRÈS avoir posé `done` laisserait une fenêtre où
      // `order-status` sert un job « terminé » sans livrable — et si l'assemblage échoue, un job
      // `done` sans markdowns serait un état que rien ne répare. Ici : assemblage d'abord, refus
      // net s'il échoue (`marquerEchec`, avec alerte), et `done` seulement une fois les trois
      // textes ÉCRITS. Le tick suivant retrouve un job encore en `report` et réessaie — l'écriture
      // est idempotente.
      const livrables = await assemblerLivrables(sb, job)
      if ('erreur' in livrables) {
        await marquerEchec(sb, job, `assemblage du livrable : ${livrables.erreur}`)
        logJson({ ...log, status: 'assemblage_refuse', job: job.id.slice(0, 8) })
        return
      }
      const { error: ecrErr } = await sb.from('upgrade_jobs')
        .update({
          deliverable_fr: livrables.fr,
          deliverable_en: livrables.en,
          deliverable_report: livrables.rapport,
          deliverable_stats: livrables.stats,
          phase: 'done',
          finished_at: livrables.quand.toISOString(),
        })
        .eq('id', job.id)
        .neq('phase', 'done')
      if (ecrErr) {
        // Panne d'écriture : le job reste en `report`, le tick suivant réassemble. Rien n'est
        // perdu, rien n'est annoncé.
        logJson({ ...log, status: 'livrable_non_ecrit', job: job.id.slice(0, 8) })
        return
      }
      // ⚠️ `.select()` : seul le tick qui fait BASCULER la commande envoie l'e-mail n°2. Sans
      // cela, deux ticks porteurs de la même liste enverraient deux e-mails au même acheteur.
      // Et l'ERREUR est lue : un échec ici laisse un job `done` + livrable face à une commande
      // `running` — l'état exact que `reconcilierBasculesPerdues` répare au tick suivant, à
      // condition de savoir qu'il existe.
      const { data: bascule, error: bascErr } = await sb.from('orders')
        .update({ status: 'done', delivered_at: new Date().toISOString() })
        .eq('id', job.order_id)
        .eq('status', 'running')
        .select('id')
      if (bascErr) logJson({ ...log, status: 'bascule_perdue', job: job.id.slice(0, 8) })
      if (bascule?.length) await envoyerEmailLivraison(sb, job, log)
      logJson({ ...log, status: 'job_termine', job: job.id.slice(0, 8) })
    }
  }
}

/**
 * Assemble les trois markdowns du livrable depuis les rubriques ABOUTIES.
 *
 * ⚠️ Tout refus est NOMMÉ et fait échouer le job — jamais un texte amputé. C'est le pendant serveur
 * de `assembler()` d'`order-status` : même philosophie, mais ici on produit l'AUTORITÉ (les
 * markdowns), pas un résumé.
 */
async function assemblerLivrables(
  sb: SupabaseClient,
  job: Job,
): Promise<
  | { fr: string; en: string; rapport: string; stats: StatsLivrable; quand: Date }
  | { erreur: string }
> {
  const quand = new Date()
  const { data: lignes, error } = await sb
    .from('upgrade_sections')
    .select('section_id, phase, status, content')
    .eq('job_id', job.id)
    .eq('status', 'done')
  if (error || !lignes) return { erreur: 'rubriques illisibles' }

  const docType = (DOC_TYPES_VENDABLES.has(job.doc_type) ? job.doc_type : 'rcp') as ConformityDocType
  const spec = CONFORMITY_SPECS[docType]

  // ── La commande porte pays et activité ; le job de `avancerCeQuiPeut` ne les a pas chargés ────
  const { data: cmdRow } = await sb
    .from('orders')
    .select('lang, country, activity')
    .eq('id', job.order_id)
    .maybeSingle()
  const lang: OutputLang = cmdRow?.lang === 'en' ? 'en' : 'fr'
  const country = typeof cmdRow?.country === 'string' ? cmdRow.country : ''
  const activite = typeof cmdRow?.activity === 'string' ? cmdRow.activity : null

  const conformite = new Map<string, LigneAssemblage>()
  const traductions = new Map<string, string>()
  const rapportParts = new Map<string, unknown>()
  for (const l of lignes) {
    const c = l.content as Record<string, unknown> | null
    if (l.phase === 'conformity') {
      conformite.set(l.section_id, {
        sectionId: l.section_id,
        title: typeof c?.title === 'string' ? c.title : l.section_id,
        status: (c?.status === 'filled' || c?.status === 'partial' ? c.status : 'missing'),
        content: typeof c?.content === 'string' ? c.content : MISSING_MARKER,
      })
    } else if (l.phase === 'translation') {
      if (typeof c?.content === 'string') traductions.set(l.section_id, c.content)
    } else if (l.phase === 'report') {
      rapportParts.set(l.section_id, c)
    }
  }

  // ⚠️ Les rubriques `missing` n'ont PAS de ligne de traduction (elles ne se traduisent pas) : ce
  // n'est pas un trou, l'assembleur pose le marqueur EN. Mais une rubrique RENSEIGNÉE sans
  // traduction fait refuser — l'assembleur s'en charge.
  const produit = produitDepuisRubrique1(conformite.get('1')?.content)
  // ⚠️ Chaque champ se replie PAR LANGUE, et le pays ne reste jamais vide : « Pays de dépôt :  · »
  // dans un document déposé chez une autorité était le rendu réel du repli silencieux. Et une
  // rubrique 1 illisible donnait « # RCP RCP » (le repli valait déjà le préfixe) — le titre dit
  // désormais ce qu'on sait, une seule fois.
  const metaPour = (l: 'fr' | 'en') => ({
    product: produit || (l === 'fr' ? 'du document déposé' : 'the submitted document'),
    sourceName: job.source_name || 'document.pdf',
    country: country || (l === 'fr' ? 'non précisé' : 'not specified'),
    activity: activityLabel(activite, l),
  })

  const fr = assembleDocument('fr', spec, conformite, traductions, metaPour('fr'))
  if (typeof fr !== 'string') return fr
  const en = assembleDocument('en', spec, conformite, traductions, metaPour('en'))
  if (typeof en !== 'string') return en

  // ── La revue : squelette déterministe + les quatre tableaux — PREMIER appelant en production ──
  const analysis = analyseDepuisParts(rapportParts)
  if ('erreur' in analysis) return analysis
  // ⚠️ Dans l'ordre du GABARIT, jamais dans celui du plan d'exécution SQL : la liste des lacunes du
  // rapport suit cet ordre, et « la plus sérieuse » est la première — un ordre de base de données
  // ferait varier le rapport d'un run à l'autre sur le même document.
  const brutesConformite = new Map(
    lignes.filter((x) => x.phase === 'conformity').map((x) => [x.section_id, x.content]),
  )
  const sections = flattenRubrics(spec)
    .map((r) => conformite.get(r.id))
    .filter((l): l is LigneAssemblage => Boolean(l))
    .map((l) => {
      const c = brutesConformite.get(l.sectionId) as
        | { ungrounded?: string[]; figuresAdvisory?: boolean }
        | null
        | undefined
      return {
        sectionId: l.sectionId,
        title: l.title,
        status: l.status,
        ...(c?.figuresAdvisory && c.ungrounded?.length ? { figuresToVerify: c.ungrounded } : {}),
      }
    })
  const meta = metaPour(lang)
  const rapport = renderReportMarkdown(analysis.analyse, {
    spec,
    productName: meta.product,
    sourceName: meta.sourceName,
    sourceText: job.control_text ?? '',
    sourceKind: job.source_kind,
    sections,
    lang,
    // ⚠️ La MÊME horloge que `finished_at` : deux `new Date()` distincts faisaient, à cheval sur
    // minuit UTC, un rapport daté d'un jour et des métadonnées PDF datées de l'autre.
    reportDate: quand.toISOString().slice(0, 10),
    system: reviewSystem(lang),
  })
  // Les comptes de l'écran de livraison — figés ICI, le seul moment où conformité et revue sont
  // ensemble en mémoire (LOT B3, migration `0093`).
  // ⚠️ `sections` porte les 34 entrées, morceaux compris — c'est la matière brute. Le rapport et
  // les tuiles la ramènent tous deux aux 29 rubriques du DOCUMENT, par la même fonction
  // (`lacunesDuDocument`) : un rapport qui annonce « À compléter — 4 » sous une tuile qui annonce 1
  // détruit la confiance, et c'est l'artefact — pas l'écran — que l'expert transmet à l'agence.
  return { fr, en, rapport, stats: statsLivrable(sections, analysis.analyse, spec), quand }
}

/**
 * E-mail n°2 — « vos fichiers sont prêts », avec un lien NEUF.
 *
 * ⚠️ Le serveur ne détient QUE le hash des jetons : il ne peut pas reconstruire le lien de
 * l'e-mail n°1. Il en frappe un nouveau (`source: 'completion'`), comme le pont le fait déjà. Et
 * comme l'alerte d'échec, cet envoi n'échoue JAMAIS le tick : le job est terminé, le livrable est
 * en base, et l'acheteur peut toujours revenir par son lien n°1 — l'e-mail est un confort, pas la
 * livraison.
 */
async function envoyerEmailLivraison(
  sb: SupabaseClient,
  job: Job,
  log: Record<string, unknown>,
): Promise<void> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return
    const { data: cmd } = await sb
      .from('orders')
      .select('email, first_name, lang, delivery_expires_at, essai')
      .eq('id', job.order_id)
      .maybeSingle()
    if (!cmd?.email) return

    const jeton = newDeliveryToken()
    const { error: insErr } = await sb.from('order_tokens').insert({
      token_hash: await deliveryTokenHash(jeton),
      order_id: job.order_id,
      // Comme le pont : l'échéance de la commande, jamais allongée.
      expires_at: cmd.delivery_expires_at,
      source: 'completion',
    })
    if (insErr) {
      // ⚠️ AUDIBLE, et c'est la leçon du bloquant que ce log ferme : la contrainte de
      // `order_tokens` refusait `'completion'` (23514, corrigé en `0089`) et ce `return` muet a
      // caché l'échec de CHAQUE envoi — pendant que l'écran promettait l'e-mail. Un envoi « au
      // mieux » a le droit d'échouer ; il n'a pas le droit d'échouer en silence.
      logJson({ ...log, status: 'jeton_completion_refuse', code: (insErr as { code?: string }).code })
      return
    }

    const lien = `https://app.pharnos.com/u/${jeton}`
    const en = cmd.lang === 'en'
    const bonjour = cmd.first_name
      ? `${en ? 'Hello' : 'Bonjour'} ${escapeHtml(String(cmd.first_name))},`
      : en
      ? 'Hello,'
      : 'Bonjour,'
    const sujet = (cmd.essai ? (en ? '[TEST] ' : '[RECETTE] ') : '') +
      (en ? 'Your files are ready — Pharnos' : 'Vos fichiers sont prêts — Pharnos')
    const corps = en
      ? [
        `<p>${bonjour}</p>`,
        '<p>The upgrade of your document is complete. Open the page below to download your five files — the compliant document in French and in English, each as Word and PDF, plus the regulatory review.</p>',
        `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Download my files →</a></p>`,
        `<p style="color:#6b7280;font-size:12px">This link stays valid for 30 days. If the button does not work, copy this address into your browser:<br>${lien}</p>`,
      ].join('')
      : [
        `<p>${bonjour}</p>`,
        '<p>La mise à niveau de votre document est terminée. Ouvrez la page ci-dessous pour télécharger vos cinq fichiers — le document conforme en français et en anglais, chacun en Word et en PDF, plus la revue réglementaire.</p>',
        `<p><a href="${lien}" style="display:inline-block;background:#d29922;color:#20160a;font-weight:700;padding:12px 22px;border-radius:99px;text-decoration:none">Télécharger mes fichiers →</a></p>`,
        `<p style="color:#6b7280;font-size:12px">Ce lien reste valable 30 jours. Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${lien}</p>`,
      ].join('')

    // Partie TEXTE en plus du HTML (C5) : mieux notée par les filtres, et un webmail verrouillé
    // en texte seul recevait sinon un message VIDE — sans le lien, donc sans les fichiers payés.
    const texte = (en
      ? [
        cmd.first_name ? `Hello ${String(cmd.first_name)},` : 'Hello,',
        '',
        'The upgrade of your document is complete. Open this page to download your five files:',
        '',
        lien,
        '',
        'This link stays valid for 30 days.',
      ]
      : [
        cmd.first_name ? `Bonjour ${String(cmd.first_name)},` : 'Bonjour,',
        '',
        'La mise à niveau de votre document est terminée. Ouvrez cette page pour télécharger vos cinq fichiers :',
        '',
        lien,
        '',
        'Ce lien reste valable 30 jours.',
      ]).join('\n')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>',
        to: [cmd.email],
        subject: sujet,
        html: corps,
        text: texte,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    logJson({ ...log, status: 'email_livraison', job: job.id.slice(0, 8) })
  } catch (e) {
    logJson({ ...log, status: 'email_livraison_impossible', err: String(e).slice(0, 200) })
  }
}

/** Échappement minimal pour un prénom injecté dans un gabarit HTML — même règle que l'e-mail n°1. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;')
}

/**
 * Balaye les jobs et fait avancer ceux qui le peuvent — À CHAQUE TICK, avant de servir une vague.
 *
 * ⚠️ La version précédente ne l'atteignait que lorsque `next_upgrade_work()` ne rendait RIEN, donc
 * quand aucun job au monde n'avait de travail en file. Deux commandes simultanées se bloquaient
 * mutuellement : le job A ne pouvait pas passer en traduction tant que le job B n'avait pas vidé
 * ses 34 rubriques. Avec un flux d'arrivées continu, plus aucun job ne changeait jamais de phase.
 */
/**
 * Répare les BASCULES PERDUES — un job `done` avec livrable face à une commande restée `running`.
 *
 * ⚠️ Deux chemins y mènent, et aucun ne se répare seul : l'isolat tué entre l'écriture des
 * markdowns et la bascule, ou un échec de cette écriture-là. La commande figée n'est plus vue par
 * `avancerCeQuiPeut` (le job est `done`), le cron finit par s'éteindre (son prédicat porte sur les
 * jobs), et l'acheteur reste sur un écran de traitement à 100 % pour toujours — livrable en base,
 * payé, jamais servi. Cette passe est IDEMPOTENTE (le CAS `running→done` ne gagne qu'une fois) et
 * c'est elle qui rattrape aussi l'e-mail n°2 de ces commandes.
 */
async function reconcilierBasculesPerdues(
  sb: SupabaseClient,
  log: Record<string, unknown>,
): Promise<void> {
  const { data: orphelins, error } = await sb
    .from('upgrade_jobs')
    .select(`${CHAMPS_JOB}, orders!inner(status)`)
    .eq('phase', 'done')
    .is('error', null)
    .not('deliverable_fr', 'is', null)
    .eq('orders.status', 'running')
    .limit(5)
  if (error || !orphelins?.length) return
  for (const brut of orphelins as unknown as Record<string, unknown>[]) {
    const job = { ...(brut as unknown as Job), lang: 'fr' as const, country: null, activity: null }
    // ⚠️ L'erreur est LUE — le défaut corrigé dix lignes plus haut ne se réintroduit pas ici :
    // une panne d'écriture persistante repasserait sinon à chaque tick, sans un mot.
    const { data: bascule, error: bascErr } = await sb.from('orders')
      .update({ status: 'done', delivered_at: new Date().toISOString() })
      .eq('id', job.order_id)
      .eq('status', 'running')
      .select('id')
    if (bascErr) {
      logJson({ ...log, status: 'reconciliation_echouee', job: job.id.slice(0, 8) })
      continue
    }
    if (bascule?.length) {
      logJson({ ...log, status: 'bascule_reparee', job: job.id.slice(0, 8) })
      await envoyerEmailLivraison(sb, job, log)
    }
  }
}

async function avancerCeQuiPeut(sb: SupabaseClient, log: Record<string, unknown>): Promise<void> {
  const { data: jobs, error } = await sb
    .from('upgrade_jobs')
    .select(CHAMPS_JOB)
    .neq('phase', 'done')
    // ⚠️ Le filtre est ici AUSSI, et pas seulement dans `avancerPhase` : sans lui, les jobs jamais
    // lancés — dépôt abandonné, dépôt refusé à la porte — consomment les 20 emplacements de cette
    // liste. Ils n'atteignent jamais `phase = 'done'`, rien ne les en sort, et ils sont les plus
    // ANCIENS donc les premiers servis. Au vingtième, plus aucun job vivant n'était vu : le moteur
    // s'arrêtait pour tout le monde, définitivement.
    .not('started_at', 'is', null)
    .order('created_at')
    .limit(20)
  if (error || !jobs) return
  for (const j of jobs as unknown as Job[]) {
    await avancerPhase(sb, { ...j, lang: 'fr', country: null, activity: null }, log)
  }
}

/* ──────────────────────────────────── Le tick ─────────────────────────────────────────────── */

Deno.serve(async (req) => {
  const log = { fn: 'job-tick', reqId: newReqId() }
  const debut = Date.now()
  const echeance = debut + BUDGET_INVOCATION_MS
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Contrôle BON MARCHÉ d'abord : sur un point d'entrée sans JWT, chaque requête anonyme ne doit
  // pas coûter un aller-retour base. Le secret fait 64 caractères hexadécimaux, toujours.
  const presente = req.headers.get('x-cron-secret') ?? ''
  if (presente.length !== 64) return json({ error: 'forbidden' }, 403)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: attendu, error: hashErr } = await sb.rpc('upgrade_tick_secret_hash')
  // Secret absent ⇒ porte FERMÉE. L'absence de configuration ne doit jamais ouvrir. Et le même 403
  // que l'échec de comparaison : distinguer les deux dirait à un inconnu si le secret est posé.
  if (hashErr || typeof attendu !== 'string' || attendu.length !== 64) {
    logJson({ ...log, status: 'secret_absent' })
    return json({ error: 'forbidden' }, 403)
  }
  if (!egalConstant(await sha256Hex(presente), attendu)) {
    logJson({ ...log, status: 'auth_refusee' })
    return json({ error: 'forbidden' }, 403)
  }

  // Le filet AVANT tout : rendre à la file ce qu'une invocation tuée a laissé en `running`, et
  // trancher les rubriques que plus rien ne peut réclamer.
  const { data: remises } = await sb.rpc('requeue_dead_sections', { p_stale_seconds: 180 })
  if (typeof remises === 'number' && remises > 0) logJson({ ...log, status: 'filet', remises })

  let vagues = 0
  let rubriques = 0

  // ── La boucle : plusieurs vagues par invocation, tant que le temps le permet ───────────────────
  for (;;) {
    // L'avancement passe AVANT le service : sans cela, un job prêt à changer de phase attend qu'un
    // autre ait vidé la sienne.
  // ⚠️ UNE fois par invocation, jamais par tour de boucle : la requête balaie les jobs `done`
  // (non indexés par l'index partiel de 0087) — ~14 passages par invocation étaient du pur gâchis.
  await reconcilierBasculesPerdues(sb, log)
    await avancerCeQuiPeut(sb, log)

    const { data: travail, error: workErr } = await sb.rpc('next_upgrade_work')
    if (workErr) {
      logJson({ ...log, status: 'work_error' })
      break
    }
    const item = (Array.isArray(travail) ? travail[0] : null) as
      | { job_id: string; phase: string }
      | null
    if (!item) break

    if (echeance - Date.now() < trancheMinMs(item.phase) + MARGE_ECRITURE_MS) break

    const servies = await servirVague(sb, item, echeance, log)
    if (servies < 0) break // panne franche : on rend la main, le cron reprendra.
    vagues++
    rubriques += servies
    if (servies === 0) break // plafond global atteint : inutile d'insister dans cette invocation.
  }

  logJson({ ...log, status: 'fin', vagues, rubriques, ms: Date.now() - debut })
  return json({ ok: true, vagues, rubriques, ms: Date.now() - debut }, 200)
})

/** Sert UNE vague. Rend le nombre de rubriques traitées, ou -1 sur panne franche. */
async function servirVague(
  sb: SupabaseClient,
  item: { job_id: string; phase: string },
  echeance: number,
  log: Record<string, unknown>,
): Promise<number> {
  const { data: jobRow, error: jobErr } = await sb
    .from('upgrade_jobs')
    .select(`${CHAMPS_JOB}, orders!inner(lang, country, activity)`)
    .eq('id', item.job_id)
    .maybeSingle()
  if (jobErr || !jobRow) return -1
  const brut = jobRow as unknown as Record<string, unknown>
  const rel = brut.orders as unknown
  const cmd = (Array.isArray(rel) ? rel[0] : rel) as
    | { lang?: string; country?: string | null; activity?: string | null }
    | undefined
  // La langue vient de la COMMANDE : un acheteur anglophone ne doit pas recevoir un rapport
  // français. Elle était figée à 'fr' en dur.
  //
  // ⚠️ Pays et activité aussi — et ils n'étaient JAMAIS lus. La mention de vigilance 4.8 (celle
  // qui varie par pays) et les consignes des rubriques 8/9/10 (qui dépendent de l'activité)
  // n'entraient donc dans AUCUN prompt de production. `null` reste `null` : le repli neutre est le
  // cas courant de quatre pays sur huit, jamais une lacune à corriger.
  const job: Job = {
    ...(brut as unknown as Job),
    lang: cmd?.lang === 'en' ? 'en' : 'fr',
    country: cmd?.country ?? null,
    activity: cmd?.activity ?? null,
  }

  const { data: reclamees, error: claimErr } = await sb.rpc('claim_upgrade_sections', {
    p_job: job.id,
    p_phase: item.phase,
    p_limit: VAGUE,
    p_global_cap: PLAFOND_GLOBAL,
  })
  if (claimErr) {
    logJson({ ...log, status: 'claim_error' })
    return -1
  }
  const brutes = (reclamees ?? []) as { id: string; section_id: string; attempts: number }[]
  if (!brutes.length) {
    logJson({ ...log, status: 'aucune_prise', phase: item.phase })
    return 0
  }
  // En revue, le tableau le plus COURT doit préchauffer : `created_at` ne les départage pas (même
  // horodatage de transaction), l'ordre revenait au hasard du plan d'exécution.
  const vague = item.phase === 'report' ? trierVagueRevue(brutes) : brutes

  const docType = (DOC_TYPES_VENDABLES.has(job.doc_type) ? job.doc_type : 'rcp') as ConformityDocType
  const spec = CONFORMITY_SPECS[docType]
  const source = prepareSource(job.control_text ?? '', job.source_kind)

  // ⚠️ Sans corpus de contrôle, `verifyEvidence` rend `unverifiable` — un verdict que
  // `isEvidenceRejected` N'EXCLUT PAS : les 34 rubriques seraient acceptées SANS AUCUNE
  // vérification, et livrées. La garantie zéro-invention tomberait en silence.
  if (item.phase !== 'translation' && !source.available) {
    await sb.from('upgrade_sections')
      .update({ status: 'failed', claimed_at: null, error: 'corpus de contrôle absent' })
      .in('id', vague.map((v) => v.id))
    logJson({ ...log, status: 'corpus_absent', job: job.id.slice(0, 8) })
    return -1
  }

  // La PIÈCE : le modèle lit le PDF, jamais le corpus océrisé — sinon il reprocherait au client les
  // coquilles de NOTRE reconnaissance de caractères.
  let sourceParts: Part[] = []
  if (item.phase !== 'translation') {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(job.source_path)
    if (dlErr || !blob) {
      // ⚠️ La tentature est RENDUE : cet échec n'a coûté aucun appel. Sans cela, trois pannes
      // Storage laissaient les rubriques `queued` avec `attempts = 3` — plus réclamables par le
      // `claim`, invisibles du filet (qui ne balaie que `running`), mais toujours comptées comme du
      // travail en attente : le job était figé pour toujours, sans un seul log.
      for (const v of vague) {
        await sb.from('upgrade_sections')
          .update({ status: 'queued', claimed_at: null, attempts: Math.max(0, v.attempts - 1) })
          .eq('id', v.id)
      }
      logJson({ ...log, status: 'source_illisible', job: job.id.slice(0, 8) })
      return -1
    }
    // `encodeBase64` du std : la concaténation octet par octet montait à ~50 Mo de chaîne
    // intermédiaire sur un scan de 25 Mo, au-dessus du buffer déjà résident — CPU et mémoire de
    // l'isolat, à chaque vague.
    sourceParts = [{
      inlineData: {
        mimeType: 'application/pdf',
        data: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
      },
    }]
  }

  const { count: abouties } = await sb
    .from('upgrade_sections')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('phase', item.phase)
    .eq('status', 'done')

  const rapport = await boundedMap(
    vague,
    async (ligne) => {
      const usage = emptyUsage()
      const valeur = await runWithUsage(usage, () =>
        executer(sb, item.phase, ligne.section_id, { spec, source, sourceParts, job, echeance }))
      return { valeur, usage }
    },
    {
      concurrency: VAGUE,
      warmupFirst: doitPrechauffer(item.phase, abouties ?? 0, vague.length),
      deadline: echeance,
      minSliceMs: trancheMinMs(item.phase),
    },
  )

  // ── L'état s'écrit rubrique par rubrique : la granularité de la DÉPENSE ───────────────────────
  let ok = 0
  let echecs = 0
  for (const o of rapport.outcomes) {
    const ligne = vague[o.index]
    if (o.skipped) {
      // Jamais lancée : elle rend sa tentative, elle n'a rien coûté.
      await ecrire(sb, ligne.id, {
        status: 'queued',
        claimed_at: null,
        attempts: Math.max(0, ligne.attempts - 1),
      }, log)
      continue
    }
    if (o.error) {
      echecs++
      // Décidé sur le TYPE de l'erreur, jamais sur la prose de son message : un timeout ne se
      // rejoue JAMAIS, une panne transitoire se rejoue jusqu'au plafond (`job-tick-core.ts`).
      const statut = classerEchec(o.error, ligne.attempts)
      await ecrire(sb, ligne.id, {
        status: statut,
        claimed_at: null,
        error: String(o.error.message).slice(0, 2000),
        finished_at: statut === 'failed' ? new Date().toISOString() : null,
      }, log)
      continue
    }
    ok++
    await ecrire(sb, ligne.id, {
      status: 'done',
      content: o.value!.valeur as unknown as Record<string, unknown>,
      tokens: o.value!.usage as unknown as Record<string, unknown>,
      finished_at: new Date().toISOString(),
      claimed_at: null,
    }, log)
    // Le NOM DU PRODUIT se fige dès que la rubrique 1 aboutit — UNE écriture par job, pour que la
    // page publique (sondée toutes les 2 s) le lise sur la ligne de job qu'elle charge déjà, au
    // lieu de requêter la rubrique 1 à chaque sondage. Best-effort : un échec ici ne coûte que le
    // bandeau, jamais la rubrique — et l'assemblage re-dérive le nom de toute façon.
    if (item.phase === 'conformity' && ligne.section_id === '1') {
      const produit = produitDepuisRubrique1(
        (o.value!.valeur as { content?: string } | null)?.content,
      )
      if (produit) {
        await sb.from('upgrade_jobs').update({ product_name: produit }).eq('id', job.id)
      }
    }
  }

  // Décompte de la PHASE COURANTE : sans le filtre, le compteur cumulait les trois passes et
  // finissait à 63 pour un total de 34.
  const { count: faites } = await sb
    .from('upgrade_sections')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
    .eq('phase', item.phase)
    .eq('status', 'done')
  await sb.from('upgrade_jobs').update({ sections_done: faites ?? 0 }).eq('id', job.id)

  logJson({
    ...log,
    status: 'vague',
    phase: item.phase,
    prises: vague.length,
    ok,
    echecs,
    plusLente: rapport.slowestMs,
  })
  return vague.length
}

/**
 * Écrit l'état d'une rubrique, et VÉRIFIE l'écriture.
 *
 * ⚠️ Une écriture de `done` perdue laisse la ligne en `running` ; le filet la remet en file à
 * +180 s, et la rubrique est régénérée — donc REPAYÉE — alors que son résultat existait. C'est le
 * contrat n°2 (« la granularité de la sauvegarde est celle de la dépense ») qui tombait en silence.
 */
const respirer = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function ecrire(
  sb: SupabaseClient,
  id: string,
  champs: Record<string, unknown>,
  log: Record<string, unknown>,
): Promise<void> {
  for (let essai = 1; essai <= 2; essai++) {
    const { error } = await sb.from('upgrade_sections').update(champs).eq('id', id)
    if (!error) return
    if (essai === 2) {
      logJson({ ...log, status: 'ecriture_perdue', section: id.slice(0, 8), champ: String(champs.status) })
      return
    }
    // Deux tentatives immédiates sur la même panne n'en font qu'une — et la conséquence d'un
    // échec ici est une rubrique REPAYÉE. 250 ms laissent passer un basculement de connexion.
    await respirer(250)
  }
}

interface Contexte {
  spec: typeof CONFORMITY_SPECS[ConformityDocType]
  source: ReturnType<typeof prepareSource>
  sourceParts: Part[]
  job: Job
  echeance: number
}

/** Aiguille une rubrique vers la passe qui lui correspond. */
async function executer(
  sb: SupabaseClient,
  phase: string,
  sectionId: string,
  ctx: Contexte,
): Promise<unknown> {
  const restant = ctx.echeance - Date.now()

  if (phase === 'conformity') {
    const rubric = findRubric(ctx.spec, sectionId)
    if (!rubric) throw new Error(`rubrique « ${sectionId} » hors gabarit`)
    return await generateSection(generateAnthropic, {
      spec: ctx.spec,
      rubric,
      sourceParts: ctx.sourceParts,
      source: ctx.source,
      system: conformitySystem({ docType: ctx.spec.docType, missingMarker: MISSING_MARKER }),
      outputLang: ctx.job.lang,
      // ⚠️ Le pays FILTRE les mentions imposées (vigilance 4.8) ; l'activité voyage en contexte
      // CERTIFIÉ (rubriques 8/9/10). Ni l'un ni l'autre n'atteignaient le moteur en production.
      countryCode: ctx.job.country ?? undefined,
      extraContext: activityContextLine(ctx.job.activity) || undefined,
      budgetMs: Math.min(SECTION_BUDGET_MS, restant),
    })
  }

  if (phase === 'translation') {
    const { data, error } = await sb
      .from('upgrade_sections')
      .select('content')
      .eq('job_id', ctx.job.id)
      .eq('phase', 'conformity')
      .eq('section_id', sectionId)
      .maybeSingle()
    if (error) throw new Error(`amont illisible pour « ${sectionId} »`)
    const amont = data?.content as { title?: string; status?: string; content?: string } | null
    if (!amont?.content) throw new Error(`traduction sans amont pour « ${sectionId} »`)
    return await translateSection(generateAnthropic, {
      sectionId,
      title: amont.title ?? sectionId,
      status: (amont.status ?? 'filled') as 'filled' | 'partial' | 'missing',
      content: amont.content,
      targetLang: 'en',
      system: translationSystem('en'),
      budgetMs: Math.min(TRANSLATE_BUDGET_MS, restant),
    })
  }

  // ── REVUE : une ligne = UN tableau ────────────────────────────────────────────────────────────
  const part = sectionId as ReportPart
  if (!REPORT_PARTS.includes(part)) throw new Error(`tableau de revue inconnu : ${sectionId}`)

  const { data: rubriques, error: rubErr } = await sb
    .from('upgrade_sections')
    .select('section_id, content')
    .eq('job_id', ctx.job.id)
    .eq('phase', 'conformity')
    .eq('status', 'done')
  if (rubErr || !rubriques) throw new Error('rubriques de conformité illisibles')
  const sections = rubriques.map((r) => {
    const c = r.content as
      | { title?: string; status?: string; ungrounded?: string[]; figuresAdvisory?: boolean }
      | null
    return {
      sectionId: r.section_id,
      title: c?.title ?? r.section_id,
      status: (c?.status ?? 'missing') as 'filled' | 'partial' | 'missing',
      ...(c?.figuresAdvisory && c.ungrounded?.length ? { figuresToVerify: c.ungrounded } : {}),
    }
  })

  let tail: string | undefined
  if (part === 'recommendations') {
    const { data: cst, error: cstErr } = await sb
      .from('upgrade_sections')
      .select('content, status')
      .eq('job_id', ctx.job.id)
      .eq('phase', 'report')
      .eq('section_id', 'findings')
      .maybeSingle()
    // ⚠️ Sans constats ABOUTIS, on refuse. Poursuivre ferait affirmer « aucun constat n'a été
    // retenu » — une phrase FAUSSE, que le rapport rendrait en « Aucun. » sous Constats.
    if (cstErr || cst?.status !== 'done') {
      throw new Error('recommandations demandées avant que les constats ne soient établis')
    }
    const trouves = (cst.content as { findings?: { criticality: string; title: string }[] } | null)
      ?.findings ?? []
    tail = trouves.length
      ? [
        'Constats DÉJÀ établis sur ce document. Tes actions doivent les COUVRIR sans les reformuler :',
        ...trouves.map((f) => `- [${f.criticality}] ${f.title}`),
      ].join('\n')
      : 'Aucun constat n\'a été retenu sur ce document : ne recommande que ce que le document justifie.'
  }

  const outcome = await generateReportPart(
    generateAnthropic,
    {
      spec: ctx.spec,
      productName: 'votre produit',
      sourceName: ctx.job.source_path.split('/').pop() ?? 'document.pdf',
      sourceText: ctx.job.control_text ?? '',
      sourceKind: ctx.job.source_kind,
      sourceParts: ctx.sourceParts,
      sections,
      lang: ctx.job.lang,
      reportDate: new Date().toISOString().slice(0, 10),
      system: reviewSystem(ctx.job.lang),
    },
    part,
    { deadline: ctx.echeance, tail },
  )

  // ⚠️ **La garantie factuelle de la revue se tient ICI, et nulle part ailleurs sur ce chemin.**
  // `pruneUnverifiable` vit dans `generateReport`, l'orchestrateur — que le worker n'utilise pas,
  // puisqu'il pilote les tableaux un par un. Sans ce rappel, plus rien n'écartait une
  // `source_position` ou un `before` absents du document : « votre rubrique 7 s'intitule Fabricant »
  // serait rendu au client sans que la chaîne figure nulle part dans sa source. Le contrôle ne juge
  // NI les constats NI les recommandations — ce sont des analyses, pas des citations — donc il ne
  // coûte réellement quelque chose que sur `relocations` et `terminology`.
  const { analysis, dropped, strictClaims } = pruneUnverifiable(outcome.analysis, ctx.source)
  if (dropped.length) {
    logJson({ fn: 'job-tick', op: 'ancrage', part, ecartees: dropped.length, strictClaims })
  }
  return { ...analysis, strayRows: outcome.strayRows, droppedClaims: dropped, strictClaims }
}
