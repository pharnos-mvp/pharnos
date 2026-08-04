// Edge Function `job-tick` — le moteur en série (U4). UNE invocation = UNE vague.
//
// Le mur n'est pas le CPU : les 60 appels du moteur sont de l'ATTENTE, le calcul y est négligeable.
// C'est le wall clock de 150 s par invocation. Une orchestration de 5,3 minutes n'y rentre pas ;
// elle rentre parfaitement en vagues de 6, dont la plus lente mesurée tient en 48,3 s.
//
// TROIS CONTRATS, tous issus de la mesure et non du plan (§ « Ce que U0 impose aux lots suivants ») :
//   1. **Une invocation = une vague**, et l'état vit chez l'appelant — ici, en base.
//   2. **L'état s'écrit après CHAQUE rubrique**, jamais en fin de passe : le premier run du banc a
//      perdu 59 appels PAYÉS sur un dépassement en passe 3. La granularité de la sauvegarde doit
//      être celle de la DÉPENSE.
//   3. **`warmupFirst` sur la PREMIÈRE vague seulement** : la vague 1 écrit le préfixe de cache
//      (16 696 jetons), les suivantes le relisent. Le répéter ne ferait que rallonger. Et AUCUN
//      préchauffage en traduction — chaque rubrique y porte son propre contenu, `cacheRead` = 0.
//
// Sécurité : `verify_jwt = false` (l'appelant est `pg_cron`, pas un humain), authentifié par un
// secret partagé comparé au HASH rendu par `upgrade_tick_secret_hash()` — le secret lui-même ne
// sort JAMAIS de la base (patron de 0051).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { EDGE_WALL_CLOCK_MS } from '../_shared/ai/limits.ts'
import { prepareSource } from '../_shared/ai/evidence.ts'
import { conformitySystem, reviewSystem, translationSystem } from '../_shared/ai/personas.ts'
import { boundedMap } from '../_shared/ai/pool.ts'
import { generateParts, type Part } from '../_shared/ai/provider.ts'
import { findRubric } from '../_shared/ai/section-schema.ts'
import { CONFORMITY_SPECS, type ConformityDocType } from '../_shared/conformity-specs.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { DOC_TYPES_VENDABLES } from '../_shared/orders-core.ts'
import { generateReportPart, REPORT_PARTS, type ReportPart } from '../_shared/report-core.ts'
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
 * Plafond GLOBAL de rubriques simultanées, toutes commandes confondues. C'est le seul endroit où la
 * montée en charge se règle : sans lui, dix acheteurs simultanés lancent 60 appels et le
 * fournisseur nous limite en 429 — chaque rejeu étant lui-même facturé.
 */
const PLAFOND_GLOBAL = 24
/**
 * Budget de l'invocation. Volontairement SOUS le mur de 150 s : il reste à télécharger le PDF,
 * l'encoder en base64 et écrire les résultats. Un budget collé au mur ferait tuer l'invocation
 * juste après le dernier appel payé — le pire moment possible.
 */
const BUDGET_INVOCATION_MS = EDGE_WALL_CLOCK_MS - 40_000
/** Une rubrique lancée doit pouvoir finir : en deçà, on la laisse à la vague suivante. */
const TRANCHE_MIN_MS = 12_000

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

/** Comparaison à temps constant : un `===` sur une chaîne rend son préfixe devinable par le temps. */
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
  control_text: string
  phase: string
}

/* ─────────────────────────────── Avancement de phase ──────────────────────────────────────── */

/**
 * Une phase est ÉPUISÉE quand elle n'a plus ni `queued` ni `running`. C'est le seul moment où l'on
 * peut créer la suivante : les rubriques de traduction dépendent de ce que la conformité a produit,
 * et celles de la revue de ce que la traduction a produit. Les créer d'avance figerait une liste
 * que le travail n'a pas encore déterminée.
 */
async function phaseEpuisee(sb: SupabaseClient, jobId: string, phase: string): Promise<boolean> {
  const { count } = await sb
    .from('upgrade_sections')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('phase', phase)
    .in('status', ['queued', 'running'])
  return (count ?? 0) === 0
}

/** Fait avancer le job d'une phase, en créant la file de la suivante. Rend la nouvelle phase. */
async function avancerPhase(sb: SupabaseClient, job: Job): Promise<string> {
  if (job.phase === 'conformity') {
    // ⚠️ Seules les rubriques RENSEIGNÉES se traduisent. Une lacune ne se traduit pas, elle se
    // ré-affiche : `translateSection` le sait et ne consomme aucun appel, mais créer la ligne
    // quand même gonflerait le décompte affiché à l'acheteur (« 34 » là où 25 travaillent).
    const { data: faites } = await sb
      .from('upgrade_sections')
      .select('section_id, content')
      .eq('job_id', job.id)
      .eq('phase', 'conformity')
      .eq('status', 'done')
    const aTraduire = (faites ?? []).filter((s) => {
      const c = s.content as { status?: string } | null
      return c?.status && c.status !== 'missing'
    })
    if (aTraduire.length) {
      await sb.from('upgrade_sections').upsert(
        aTraduire.map((s) => ({ job_id: job.id, section_id: s.section_id, phase: 'translation' })),
        { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true },
      )
    }
    await sb.from('upgrade_jobs').update({ phase: 'translation' }).eq('id', job.id)
    return 'translation'
  }

  if (job.phase === 'translation') {
    // La revue occupe QUATRE lignes, une par tableau — mais `recommendations` dépend des constats,
    // et n'est mise en file qu'une fois `findings` établi (voir plus bas). Trois d'abord.
    await sb.from('upgrade_sections').upsert(
      REPORT_PARTS.filter((p) => p !== 'recommendations').map((p) => ({
        job_id: job.id,
        section_id: p,
        phase: 'report',
      })),
      { onConflict: 'job_id,phase,section_id', ignoreDuplicates: true },
    )
    await sb.from('upgrade_jobs').update({ phase: 'report' }).eq('id', job.id)
    return 'report'
  }

  if (job.phase === 'report') {
    // Les trois tableaux indépendants sont faits : `recommendations` peut enfin partir, nourri des
    // constats. C'est la SEULE dépendance des quatre, et elle vaut d'être respectée — des actions
    // qui reformulent les constats au lieu de les couvrir donneraient deux listes redondantes.
    const { count } = await sb
      .from('upgrade_sections')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('phase', 'report')
      .eq('section_id', 'recommendations')
    if ((count ?? 0) === 0) {
      await sb.from('upgrade_sections').insert({
        job_id: job.id,
        section_id: 'recommendations',
        phase: 'report',
      })
      return 'report'
    }
    await sb.from('upgrade_jobs')
      .update({ phase: 'done', finished_at: new Date().toISOString() })
      .eq('id', job.id)
    await sb.from('orders')
      .update({ status: 'done', delivered_at: new Date().toISOString() })
      .eq('id', job.order_id)
    return 'done'
  }
  return job.phase
}

/* ──────────────────────────────────── Le tick ─────────────────────────────────────────────── */

Deno.serve(async (req) => {
  const log = { fn: 'job-tick', reqId: newReqId() }
  const debut = Date.now()
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // ── Authentification : le secret ne sort jamais de la base, on compare des HASHES ─────────────
  const presente = req.headers.get('x-cron-secret') ?? ''
  const { data: attendu, error: hashErr } = await sb.rpc('upgrade_tick_secret_hash')
  if (hashErr || typeof attendu !== 'string' || attendu.length !== 64) {
    // Secret non configuré ⇒ la porte est FERMÉE. L'absence de configuration ne doit jamais ouvrir.
    logJson({ ...log, status: 'secret_absent' })
    return json({ error: 'not_configured' }, 503)
  }
  if (!presente || !egalConstant(await sha256Hex(presente), attendu)) {
    logJson({ ...log, status: 'auth_refusee' })
    return json({ error: 'forbidden' }, 403)
  }

  // ── Le filet, avant tout : rendre à la file ce qu'une invocation tuée a laissé en `running` ────
  const { data: remises } = await sb.rpc('requeue_dead_sections', { p_stale_seconds: 180 })
  if (typeof remises === 'number' && remises > 0) {
    logJson({ ...log, status: 'filet', remises })
  }

  const { data: travail } = await sb.rpc('next_upgrade_work')
  const item = Array.isArray(travail) ? travail[0] : null

  // ── Rien en file : peut-être une phase à faire avancer ────────────────────────────────────────
  if (!item) {
    const { data: jobs } = await sb
      .from('upgrade_jobs')
      .select('id, order_id, doc_type, source_path, source_kind, control_text, phase')
      .neq('phase', 'done')
      .order('created_at')
      .limit(5)
    let avances = 0
    for (const j of (jobs ?? []) as Job[]) {
      if (await phaseEpuisee(sb, j.id, j.phase)) {
        const nouvelle = await avancerPhase(sb, j)
        avances++
        logJson({ ...log, status: 'phase', job: j.id.slice(0, 8), de: j.phase, vers: nouvelle })
      }
    }
    return json({ ok: true, avances, ms: Date.now() - debut }, 200)
  }

  const { data: jobRow } = await sb
    .from('upgrade_jobs')
    .select('id, order_id, doc_type, source_path, source_kind, control_text, phase')
    .eq('id', item.job_id)
    .maybeSingle()
  if (!jobRow) return json({ error: 'job_introuvable' }, 404)
  const job = jobRow as Job

  // ── Réclamation d'une vague : `SKIP LOCKED` + sémaphore global, dans la MÊME requête ───────────
  const { data: reclamees, error: claimErr } = await sb.rpc('claim_upgrade_sections', {
    p_job: job.id,
    p_phase: item.phase,
    p_limit: VAGUE,
    p_global_cap: PLAFOND_GLOBAL,
  })
  if (claimErr) {
    logJson({ ...log, status: 'claim_error' })
    return json({ error: 'db' }, 503)
  }
  const vague = (reclamees ?? []) as { id: string; section_id: string; attempts: number }[]
  if (!vague.length) {
    // Plafond global atteint : ce n'est PAS une erreur, c'est la régulation qui fait son travail.
    logJson({ ...log, status: 'plafond', phase: item.phase })
    return json({ ok: true, plafond: true, ms: Date.now() - debut }, 200)
  }

  const docType = (DOC_TYPES_VENDABLES.has(job.doc_type) ? job.doc_type : "rcp") as ConformityDocType
  const spec = CONFORMITY_SPECS[docType]
  const lang: OutputLang = 'fr'
  const echeance = debut + BUDGET_INVOCATION_MS
  const source = prepareSource(job.control_text ?? '', job.source_kind)

  // La PIÈCE : le modèle lit le PDF, jamais le corpus océrisé. Sans elle, il reprocherait au client
  // les coquilles de NOTRE reconnaissance de caractères.
  let sourceParts: Part[] = []
  if (item.phase !== 'translation') {
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(job.source_path)
    if (dlErr || !blob) {
      logJson({ ...log, status: 'source_illisible' })
      // Les rubriques réclamées retournent en file : elles n'ont rien coûté.
      await sb.from('upgrade_sections').update({ status: 'queued', claimed_at: null })
        .in('id', vague.map((v) => v.id))
      return json({ error: 'storage' }, 503)
    }
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (const b of buf) bin += String.fromCharCode(b)
    sourceParts = [{ inlineData: { mimeType: 'application/pdf', data: btoa(bin) } }]
  }

  // ── La vague. `warmupFirst` UNIQUEMENT sur la première de la phase de conformité ───────────────
  // Vague 1 : écrit 16 696 jetons de préfixe, en lit 0. Vagues 2 à 6 : en lisent 16 696 chacune.
  // Le répéter ne ferait que rallonger. En traduction il n'y a PAS de préfixe commun — chaque
  // rubrique porte son propre contenu, `cacheRead` valait 0 sur les 25 mesurées.
  const premiereVague = item.phase === 'conformity' && vague.some((v) => v.attempts === 1) &&
    (await premiereDeLaPhase(sb, job.id, item.phase))

  const rapport = await boundedMap(
    vague,
    async (ligne) => {
      const usage = emptyUsage()
      const valeur = await runWithUsage(usage, () =>
        executer(sb, item.phase, ligne.section_id, {
          spec,
          lang,
          source,
          sourceParts,
          job,
          echeance,
        }))
      return { ligne, valeur, usage }
    },
    {
      concurrency: VAGUE,
      warmupFirst: premiereVague,
      deadline: echeance,
      minSliceMs: TRANCHE_MIN_MS,
    },
  )

  // ── L'état s'écrit rubrique par rubrique — la granularité de la DÉPENSE ───────────────────────
  let ok = 0
  let echecs = 0
  for (const o of rapport.outcomes) {
    const ligne = vague[o.index]
    if (o.skipped) {
      // Jamais lancée : elle retourne en file SANS consommer sa tentative.
      await sb.from('upgrade_sections')
        .update({ status: 'queued', claimed_at: null, attempts: ligne.attempts - 1 })
        .eq('id', ligne.id)
      continue
    }
    if (o.error) {
      echecs++
      // ⚠️ Un TIMEOUT ne se rejoue JAMAIS (invariant moteur) : sous le mur, une seconde tentative
      // ne peut pas aboutir, et elle serait facturée. On la marque épuisée tout de suite.
      const msg = String(o.error.message).slice(0, 2000)
      const definitif = /délai|timeout|abort|tronqu/i.test(msg) || ligne.attempts >= 3
      await sb.from('upgrade_sections')
        .update({
          status: definitif ? 'failed' : 'queued',
          claimed_at: null,
          error: msg,
          finished_at: definitif ? new Date().toISOString() : null,
        })
        .eq('id', ligne.id)
      continue
    }
    ok++
    await sb.from('upgrade_sections')
      .update({
        status: 'done',
        content: o.value!.valeur as unknown as Record<string, unknown>,
        tokens: o.value!.usage as unknown as Record<string, unknown>,
        finished_at: new Date().toISOString(),
        claimed_at: null,
      })
      .eq('id', ligne.id)
  }

  const { count: faites } = await sb
    .from('upgrade_sections')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', job.id)
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
    ms: Date.now() - debut,
  })
  return json({ ok: true, phase: item.phase, prises: vague.length, faites: ok, echecs }, 200)
})

/** Aucune rubrique de cette phase n'a encore abouti ⇒ le cache de préfixe n'est pas encore écrit. */
async function premiereDeLaPhase(sb: SupabaseClient, jobId: string, phase: string): Promise<boolean> {
  const { count } = await sb
    .from('upgrade_sections')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('phase', phase)
    .eq('status', 'done')
  return (count ?? 0) === 0
}

interface Contexte {
  spec: typeof CONFORMITY_SPECS[ConformityDocType]
  lang: OutputLang
  source: ReturnType<typeof prepareSource>
  sourceParts: Part[]
  job: Job
  echeance: number
}

/** Aiguille une rubrique vers la passe qui lui correspond. Aucune décision de budget ici. */
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
      outputLang: ctx.lang,
      budgetMs: Math.min(SECTION_BUDGET_MS, restant),
    })
  }

  if (phase === 'translation') {
    const { data } = await sb
      .from('upgrade_sections')
      .select('content')
      .eq('job_id', ctx.job.id)
      .eq('phase', 'conformity')
      .eq('section_id', sectionId)
      .maybeSingle()
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

  // ── REVUE : une ligne = UN tableau. `recommendations` reçoit les constats en queue variable ────
  const part = sectionId as ReportPart
  if (!REPORT_PARTS.includes(part)) throw new Error(`tableau de revue inconnu : ${sectionId}`)

  const { data: rubriques } = await sb
    .from('upgrade_sections')
    .select('section_id, content')
    .eq('job_id', ctx.job.id)
    .eq('phase', 'conformity')
    .eq('status', 'done')
  const sections = (rubriques ?? []).map((r) => {
    const c = r.content as { title?: string; status?: string; ungrounded?: string[]; figuresAdvisory?: boolean } | null
    return {
      sectionId: r.section_id,
      title: c?.title ?? r.section_id,
      status: (c?.status ?? 'missing') as 'filled' | 'partial' | 'missing',
      ...(c?.figuresAdvisory && c.ungrounded?.length ? { figuresToVerify: c.ungrounded } : {}),
    }
  })

  let tail: string | undefined
  if (part === 'recommendations') {
    const { data: cst } = await sb
      .from('upgrade_sections')
      .select('content')
      .eq('job_id', ctx.job.id)
      .eq('phase', 'report')
      .eq('section_id', 'findings')
      .maybeSingle()
    const trouves = (cst?.content as { findings?: { criticality: string; title: string }[] } | null)?.findings ?? []
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
      lang: ctx.lang,
      reportDate: new Date().toISOString().slice(0, 10),
      system: reviewSystem(ctx.lang),
    },
    part,
    { deadline: Math.min(ctx.echeance, Date.now() + restant), tail },
  )
  return outcome.analysis
}
