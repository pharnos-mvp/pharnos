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
import { findRubric } from '../_shared/ai/section-schema.ts'
import { CONFORMITY_SPECS, type ConformityDocType } from '../_shared/conformity-specs.ts'
import {
  classerEchec,
  doitPrechauffer,
  jugerPhase,
  PHASE_SUIVANTE,
  trancheMinMs,
  trierVagueRevue,
} from '../_shared/job-tick-core.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { DOC_TYPES_VENDABLES } from '../_shared/orders-core.ts'
import {
  generateReportPart,
  pruneUnverifiable,
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
  lang: OutputLang
}

const CHAMPS_JOB = 'id, order_id, doc_type, source_path, source_kind, control_text, phase'

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

/** Marque le job ET la commande en échec — un job cassé doit se distinguer d'un job lent. */
async function marquerEchec(sb: SupabaseClient, job: Job, raison: string): Promise<void> {
  await sb.from('upgrade_jobs').update({ error: raison.slice(0, 2000) }).eq('id', job.id)
  await sb.from('orders').update({ status: 'failed' }).eq('id', job.order_id).eq('status', 'running')
}

/**
 * Fait avancer d'une phase le job dont la phase courante est terminée ET saine.
 *
 * Les rubriques de la phase suivante ne sont créées qu'ICI : celles de traduction dépendent de ce
 * que la conformité a produit, celles de la revue de ce que la traduction a produit. Les créer
 * d'avance figerait une liste que le travail n'a pas encore déterminée.
 */
async function avancerPhase(sb: SupabaseClient, job: Job, log: Record<string, unknown>): Promise<void> {
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
      await marquerEchec(sb, job, `phase ${job.phase} : ${verdict.raison} (${compte.failed} échec(s), ${compte.bloquees} bloquée(s))`)
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
        .insert({ job_id: job.id, section_id: 'recommendations', phase: 'report' })
      if (!insErr) logJson({ ...log, status: 'phase', job: job.id.slice(0, 8), vers: 'recommendations' })
      return
    }
    if (PHASE_SUIVANTE.report === null) {
      await sb.from('upgrade_jobs')
        .update({ phase: 'done', finished_at: new Date().toISOString() })
        .eq('id', job.id)
      await sb.from('orders')
        .update({ status: 'done', delivered_at: new Date().toISOString() })
        .eq('id', job.order_id)
        .eq('status', 'running')
      logJson({ ...log, status: 'job_termine', job: job.id.slice(0, 8) })
    }
  }
}

/**
 * Balaye les jobs et fait avancer ceux qui le peuvent — À CHAQUE TICK, avant de servir une vague.
 *
 * ⚠️ La version précédente ne l'atteignait que lorsque `next_upgrade_work()` ne rendait RIEN, donc
 * quand aucun job au monde n'avait de travail en file. Deux commandes simultanées se bloquaient
 * mutuellement : le job A ne pouvait pas passer en traduction tant que le job B n'avait pas vidé
 * ses 34 rubriques. Avec un flux d'arrivées continu, plus aucun job ne changeait jamais de phase.
 */
async function avancerCeQuiPeut(sb: SupabaseClient, log: Record<string, unknown>): Promise<void> {
  const { data: jobs, error } = await sb
    .from('upgrade_jobs')
    .select(CHAMPS_JOB)
    .neq('phase', 'done')
    .order('created_at')
    .limit(20)
  if (error || !jobs) return
  for (const j of jobs as unknown as Job[]) {
    await avancerPhase(sb, { ...j, lang: 'fr' }, log)
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
    .select(`${CHAMPS_JOB}, orders!inner(lang)`)
    .eq('id', item.job_id)
    .maybeSingle()
  if (jobErr || !jobRow) return -1
  const brut = jobRow as unknown as Record<string, unknown>
  const rel = brut.orders as unknown
  const cmd = (Array.isArray(rel) ? rel[0] : rel) as { lang?: string } | undefined
  // La langue vient de la COMMANDE : un acheteur anglophone ne doit pas recevoir un rapport
  // français. Elle était figée à 'fr' en dur.
  const job: Job = { ...(brut as unknown as Job), lang: cmd?.lang === 'en' ? 'en' : 'fr' }

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
    }
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
    return await generateSection(generateParts, {
      spec: ctx.spec,
      rubric,
      sourceParts: ctx.sourceParts,
      source: ctx.source,
      system: conformitySystem({ docType: ctx.spec.docType, missingMarker: MISSING_MARKER }),
      outputLang: ctx.job.lang,
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
    return await translateSection(generateParts, {
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
    generateParts,
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
