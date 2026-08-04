// BANC D'ESSAI — mesure les passes du moteur là où vit la clé (jalons U0.2 puis U0.3).
//
// POURQUOI CETTE FONCTION EXISTE. Le plan annonce « 6 appels simultanés ≈ 2,6 min » et le dit
// lui-même : ces jetons sont une ESTIMATION, convertie par ratio caractères/jeton. Aucun de ces
// chiffres n'a jamais été observé sur l'infrastructure réelle. Or trois décisions en dépendent :
// le prix de vente, le choix entre navigateur pilote et worker asynchrone, et la taille de la
// vague. Mesurer ailleurs qu'ici ne vaudrait rien :
//
//   - `ANTHROPIC_API_KEY` est un secret Supabase. `secrets list` n'en rend qu'un condensé SHA-256,
//     jamais la valeur : la clé ne PEUT pas sortir, et c'est voulu. Le banc va donc à elle.
//   - Une mesure prise sur un poste de travail mesurerait ce poste et sa liaison. Ici, on mesure
//     Deno Deploy, son réseau et son CPU — les conditions de production, les seules qui décident.
//   - Une invocation = une vague : c'est la forme exacte du `job-tick` du worker asynchrone (U4).
//     Le banc n'est pas jetable, c'est le prototype de la boucle qui livrera.
//
// TROIS PHASES, une par passe du processus verrouillé (étapes 1 à 3) — l'appelant tient l'état
// entre les invocations, exactement comme le worker le tiendra en base :
//
//   `sections`  — mise en conformité FR par rubrique (une vague)
//   `translate` — traduction EN des rubriques produites (une vague)
//   `report`    — la revue réglementaire (un seul appel)
//
// CE QUE LE BANC NE FAIT PAS. Il ne juge pas la QUALITÉ des sorties : il rend statuts et verdicts
// tels quels, sans les interpréter. Le jugement réglementaire appartient au harnais local (U0.3),
// qui compare aux références.
//
// FERMÉ PAR DÉFAUT. Sans `BENCH_TOKEN` posé, la fonction refuse tout — un banc qui coûte de l'IA
// à chaque appel ne doit jamais être ouvert par oubli.
import { specForDocType, flattenRubrics } from '../_shared/conformity-specs.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex, timingSafeEqual } from '../_shared/share-auth.ts'
import { prepareSource, type SourceKind } from '../_shared/ai/evidence.ts'
import { conformitySystem, reviewSystem, translationSystem } from '../_shared/ai/personas.ts'
import { boundedMap, DEFAULT_CONCURRENCY, type PoolReport } from '../_shared/ai/pool.ts'
import { generateParts, type Part } from '../_shared/ai/provider.ts'
import { EDGE_WALL_CLOCK_MS } from '../_shared/ai/limits.ts'
import {
  generateSection,
  MISSING_MARKER,
  SECTION_BUDGET_MS,
  type OutputLang,
} from '../_shared/upgrade-section-core.ts'
import {
  translateSection,
  TRANSLATE_BUDGET_MS,
  type TranslateOutcome,
} from '../_shared/translate-section-core.ts'
import { generateReport, REPORT_BUDGET_MS, type ReportSection } from '../_shared/report-core.ts'
import type { SectionStatus } from '../_shared/ai/section-schema.ts'
import { emptyUsage, runWithUsage, type Usage } from '../_shared/usage.ts'

const MAX_TEXT_CHARS = 60_000
/** Borne par ITEM de traduction — une rubrique validée ne dépasse jamais cet ordre de grandeur. */
const MAX_ITEM_CHARS = 20_000
/**
 * Plafond du nombre d'items d'une requête — **il refuse, il ne tronque pas.**
 *
 * ⚠️ Il valait 30 pour un gabarit RCP qui compte 34 rubriques : la revue était calculée sur un
 * document AMPUTÉ de ses rubriques 8, 9, 10 et `prescription`, et `renderReportMarkdown` annonçait
 * « à compléter — N » sur cette vue partielle. Sur le run AARCOLD le compte tombait juste par
 * chance (les quatre écartées étaient renseignées) ; le premier dossier étranger sans numéro d'AMM
 * — cas ordinaire, rubriques 8/9/10 vides — aurait livré un rapport contredisant son propre
 * document. Une borne qui tronque en silence est pire que pas de borne du tout.
 *
 * Calibré sur le référentiel réel, avec de la marge : rcp 34, notice 26, labeling 17, cover 14,
 * pght 8.
 */
const MAX_ITEMS = 50
/**
 * Marge sous le mur de 150 s. Elle couvre la lecture du corps (jusqu'à 60 000 caractères), la
 * sérialisation de la réponse et la latence de sortie. Un banc tué en 546 ne rendrait AUCUNE
 * mesure — l'échec le plus coûteux possible, puisque les appels IA auraient été payés.
 */
const BENCH_MARGIN_MS = 20_000
/** En deçà, un item n'est pas lancé : un appel qui ne peut pas finir est un 546 déguisé. */
const MIN_SLICE_MS = 20_000

const enc = new TextEncoder()

/** Mesure d'un item : la sortie du cœur, plus la durée et les jetons que lui seul a coûtés. */
interface ItemMeasure<T> {
  ms: number
  usage: Usage
  skipped: boolean
  error?: string
  value?: T
}

function measured<I, O>(
  worker: (item: I, budgetMs: number) => Promise<O>,
  deadline: number,
): (item: I) => Promise<{ usage: Usage; value?: O; error?: string }> {
  return async (item) => {
    // Accumulateur EXTERNALISÉ, comme en production : un appel payé puis suivi d'une erreur doit
    // rester compté. Un banc qui perd les jetons des items en échec sous-estime le coût réel — et
    // c'est justement sur les items difficiles que le rejeu double la facture.
    const usage = emptyUsage()
    try {
      const budgetMs = deadline - Date.now()
      if (budgetMs < MIN_SLICE_MS) throw new Error('budget insuffisant')
      const value = await runWithUsage(usage, () => worker(item, budgetMs))
      return { usage, value }
    } catch (e) {
      return { usage, error: e instanceof Error ? e.message : String(e) }
    }
  }
}

function collect<I, O>(
  report: PoolReport<{ usage: Usage; value?: O; error?: string }>,
): { items: ItemMeasure<O>[]; totals: Usage } {
  const items: ItemMeasure<O>[] = report.outcomes.map((o) => ({
    ms: o.ms,
    usage: o.value?.usage ?? emptyUsage(),
    skipped: o.skipped,
    error: o.error?.message ?? o.value?.error,
    value: o.value?.value,
  }))
  const totals = items.reduce((a, s) => {
    a.in += s.usage.in
    a.out += s.usage.out
    a.cacheRead += s.usage.cacheRead
    a.cacheWrite += s.usage.cacheWrite
    return a
  }, emptyUsage())
  return { items, totals }
}

Deno.serve(async (req: Request) => {
  const invokedAt = Date.now()
  const reqId = newReqId()
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': reqId },
    })

  // Aucun en-tête CORS, volontairement : un banc n'a rien à faire dans un navigateur. Sans
  // `Access-Control-Allow-Origin`, aucune page web ne peut lire la réponse, même avec le jeton.
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405)

  const expected = Deno.env.get('BENCH_TOKEN') ?? ''
  if (!expected) {
    logJson({ fn: 'bench', reqId, op: 'auth', status: 'disabled' })
    return json({ error: 'banc désactivé' }, 503)
  }
  const given = req.headers.get('x-bench-token') ?? ''
  // Comparaison sur les CONDENSÉS, à temps constant : deux longueurs différentes ne doivent pas se
  // distinguer par la durée de la comparaison, sinon le jeton se devine caractère par caractère.
  if (!timingSafeEqual(enc.encode(await sha256Hex(given)), enc.encode(await sha256Hex(expected)))) {
    logJson({ fn: 'bench', reqId, op: 'auth', status: 'forbidden' })
    return json({ error: 'jeton invalide' }, 401)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const b = (raw ?? {}) as {
    phase?: string
    // sections
    sourceText?: string
    docType?: string
    countryCode?: string
    sourceKind?: string
    sections?: string[]
    limit?: number
    // translate
    items?: { sectionId?: string; title?: string; status?: string; content?: string }[]
    targetLang?: string
    // report
    productName?: string
    sourceName?: string
    lang?: string
    reportDate?: string
    reportSections?: {
      sectionId?: string
      title?: string
      status?: string
      figuresToVerify?: string[]
    }[]
    // commun
    concurrency?: number
    warmupFirst?: boolean
  }

  const phase = b.phase === 'translate' || b.phase === 'report' ? b.phase : 'sections'
  const concurrency = Math.max(1, Math.min(Number(b.concurrency) || DEFAULT_CONCURRENCY, 12))
  const warmupFirst = b.warmupFirst !== false
  const deadline = invokedAt + EDGE_WALL_CLOCK_MS - BENCH_MARGIN_MS
  const docType = String(b.docType ?? 'rcp')
  const spec = specForDocType(docType)
  if (!spec) return json({ error: 'docType inconnu' }, 400)

  /**
   * Refus explicite plutôt que troncature. Un banc dont on ampute l'entrée rend une durée, un coût
   * et un taux de lacunes FAUX — or c'est sur ces chiffres que le prix de vente se fixe.
   */
  const tooMany = (n: number, champ: string): Response | null =>
    n > MAX_ITEMS
      ? json({ error: `${champ} : ${n} éléments pour un maximum de ${MAX_ITEMS}`, reason: 'too_many_items' }, 400)
      : null

  /**
   * Le texte source ne se coupe pas non plus. La production tient déjà cet invariant — elle rend un
   * 413 nommé plutôt qu'un document amputé (`upgrade/index.ts`, mode rubrique avec pièce) ; le banc
   * doit le tenir aussi, sans quoi il mesurerait un document que personne ne déposera jamais.
   */
  const readSource = (): string | Response => {
    const t = typeof b.sourceText === 'string' ? b.sourceText : ''
    if (!t) return json({ error: 'sourceText requis' }, 400)
    if (t.length > MAX_TEXT_CHARS) {
      return json({
        error: `sourceText : ${t.length} caractères pour un maximum de ${MAX_TEXT_CHARS} — le banc ne mesure pas un document amputé`,
        reason: 'source_too_long',
      }, 413)
    }
    return t
  }

  // ── Phase TRADUCTION ─────────────────────────────────────────────────────────────────────────
  if (phase === 'translate') {
    const targetLang: OutputLang = b.targetLang === 'fr' ? 'fr' : 'en'
    const rawItems = Array.isArray(b.items) ? b.items : []
    const refusedItems = tooMany(rawItems.length, 'items')
    if (refusedItems) return refusedItems
    const items = rawItems.map((i) => ({
      sectionId: String(i.sectionId ?? '').slice(0, 40),
      title: String(i.title ?? '').slice(0, 200),
      status: String(i.status ?? 'filled') as SectionStatus,
      content: String(i.content ?? '').slice(0, MAX_ITEM_CHARS),
    }))
    if (!items.length || items.some((i) => !i.sectionId || !i.title || !i.content)) {
      return json({ error: 'items requis : sectionId, title (langue cible), content' }, 400)
    }
    const system = translationSystem(targetLang)
    logJson({ fn: 'bench', reqId, op: 'start', phase, items: items.length, concurrency })

    const report = await boundedMap(
      items,
      measured(
        (item, budgetMs) =>
          translateSection(generateParts, {
            ...item,
            targetLang,
            system,
            // Fournisseur ÉPINGLÉ, comme en production : le décodage contraint n'existe pas chez
            // tous les fournisseurs, et c'est cette chaîne-là qui livrera.
            provider: 'anthropic',
            budgetMs: Math.min(TRANSLATE_BUDGET_MS, budgetMs),
          }),
        deadline,
      ),
      // Pas de préchauffage : chaque item traduit SON contenu, il n'y a pas de long préfixe commun
      // dont la première écriture servirait les suivants. Le préchauffage ne ferait qu'allonger.
      { concurrency, warmupFirst: false, deadline, minSliceMs: MIN_SLICE_MS },
    )
    const { items: measures, totals } = collect<(typeof items)[number], TranslateOutcome>(report)
    logJson({ fn: 'bench', reqId, op: 'done', phase, ms: report.ms, ok: report.ok, ...totals })
    return json({
      reqId,
      phase,
      wave: {
        ms: report.ms,
        slowestMs: report.slowestMs,
        ok: report.ok,
        failed: report.failed,
        skipped: report.skipped,
      },
      totals,
      invocationMs: Date.now() - invokedAt,
      items: measures.map((m, i) => ({
        sectionId: items[i].sectionId,
        ms: m.ms,
        skipped: m.skipped,
        error: m.error,
        usage: m.usage,
        ...(m.value
          ? {
            translated: m.value.translated,
            attempts: m.value.attempts,
            driftedFigures: m.value.driftedFigures,
            content: m.value.content,
            status: m.value.status,
          }
          : {}),
      })),
    })
  }

  // ── Phase REVUE ──────────────────────────────────────────────────────────────────────────────
  if (phase === 'report') {
    const src = readSource()
    if (typeof src !== 'string') return src
    const sourceText = src
    const rawSections = Array.isArray(b.reportSections) ? b.reportSections : []
    const refusedSections = tooMany(rawSections.length, 'reportSections')
    if (refusedSections) return refusedSections
    // ⚠️ Un statut inconnu N'EST PAS corrigé en `missing` : il gonflerait le décompte « à compléter »
    // d'un rapport client sur une faute de frappe de l'appelant. On refuse.
    const badStatus = rawSections.find((s) => !['filled', 'partial', 'missing'].includes(String(s.status)))
    if (badStatus) {
      return json({
        error: `statut inconnu « ${String(badStatus.status).slice(0, 20)} » sur la rubrique « ${String(badStatus.sectionId).slice(0, 40)} »`,
        reason: 'unknown_status',
      }, 400)
    }
    const sections = rawSections
      .map((s) => ({
        sectionId: String(s.sectionId ?? '').slice(0, 40),
        title: String(s.title ?? '').slice(0, 200),
        status: s.status as ReportSection['status'],
        ...(Array.isArray(s.figuresToVerify) && s.figuresToVerify.length
          ? { figuresToVerify: s.figuresToVerify.map((f) => String(f).slice(0, 80)) }
          : {}),
      }))
    if (!sections.length) return json({ error: 'reportSections requis' }, 400)
    const lang: OutputLang = b.lang === 'en' ? 'en' : 'fr'
    const sourceKind = (b.sourceKind === 'ocr' ? 'ocr' : 'text') as SourceKind
    logJson({ fn: 'bench', reqId, op: 'start', phase, sections: sections.length })

    const usage = emptyUsage()
    const t0 = Date.now()
    try {
      const out = await runWithUsage(usage, () =>
        generateReport(generateParts, {
          spec,
          productName: String(b.productName ?? 'Produit').slice(0, 120),
          sourceName: String(b.sourceName ?? 'document.pdf').slice(0, 120),
          sourceText,
          sourceKind,
          sections,
          lang,
          // Injectée par l'appelant, jamais lue d'une horloge côté modèle — et le harnais la fige
          // pour que deux passages du même cas rendent le même rapport.
          reportDate: String(b.reportDate ?? '').slice(0, 40) || new Date().toISOString().slice(0, 10),
          system: reviewSystem(lang),
          provider: 'anthropic',
          budgetMs: Math.min(REPORT_BUDGET_MS, deadline - Date.now()),
        }))
      logJson({ fn: 'bench', reqId, op: 'done', phase, ms: Date.now() - t0, ...usage })
      return json({
        reqId,
        phase,
        ms: Date.now() - t0,
        totals: usage,
        invocationMs: Date.now() - invokedAt,
        markdown: out.markdown,
        droppedClaims: out.droppedClaims,
        strictClaims: out.strictClaims,
        // Le découpage se JUSTIFIE par ces deux chiffres, ou s'infirme par eux : la durée de chaque
        // tableau (aucun ne doit s'approcher de son plafond) et le nombre de lignes mal aiguillées
        // (le prix du schéma entier, gardé pour que le cache prenne).
        partsMs: out.partsMs,
        partsAttempts: out.partsAttempts,
        strayRows: out.strayRows,
      })
    } catch (e) {
      // Les jetons d'un rapport en échec sont quand même rendus : ils ont été payés.
      //
      // ⚠️ SAUF SUR UN DÉPASSEMENT DE DÉLAI, et c'est le cas le plus fréquent ici. Le SDK n'ayant
      // reçu aucune réponse, `recordUsage` n'est jamais appelé : `totals` vaut ZÉRO alors qu'Anthropic
      // a bien facturé l'entrée et la réflexion produite. Mesuré le 03/08/2026 — trois revues
      // avortées ont coûté ~1,01 $, retrouvés seulement par différence avec la console de
      // facturation. Le drapeau le DIT, faute de quoi un coût invisible se lirait comme un coût nul.
      const message = e instanceof Error ? e.message : String(e)
      const timedOut = /délai|timeout|abort/i.test(message)
      logJson({ fn: 'bench', reqId, op: 'error', phase, ms: Date.now() - t0, timedOut, ...usage })
      return json({
        reqId,
        phase,
        ms: Date.now() - t0,
        totals: usage,
        /** `true` = `totals` est un PLANCHER, pas la dépense réelle. Ne jamais l'additionner comme un zéro. */
        usageUnobservable: timedOut,
        invocationMs: Date.now() - invokedAt,
        error: message,
      }, 502)
    }
  }

  // ── Phase RUBRIQUES (défaut) ─────────────────────────────────────────────────────────────────
  const srcSections = readSource()
  if (typeof srcSections !== 'string') return srcSections
  const sourceText = srcSections

  const all = flattenRubrics(spec)
  // Choix des rubriques : une liste explicite, sinon les N premières. Les mesurer TOUTES en une
  // invocation ne tiendrait pas sous 150 s — c'est précisément ce que le banc doit établir.
  const wanted = Array.isArray(b.sections) && b.sections.length
    ? all.filter((r) => b.sections!.includes(r.id))
    : all.slice(0, Math.max(1, Math.min(Number(b.limit) || DEFAULT_CONCURRENCY, all.length)))
  if (!wanted.length) return json({ error: 'aucune rubrique retenue' }, 400)
  // Un identifiant inconnu se perdrait silencieusement dans le `filter` ci-dessus : l'appelant
  // croirait avoir mesuré N rubriques et en aurait mesuré N−1.
  if (Array.isArray(b.sections) && b.sections.length !== wanted.length) {
    const inconnues = b.sections.filter((id) => !all.some((r) => r.id === id))
    return json({ error: `rubriques inconnues du gabarit : ${inconnues.join(', ')}`, reason: 'unknown_section' }, 400)
  }
  const refusedWave = tooMany(wanted.length, 'sections')
  if (refusedWave) return refusedWave

  const sourceKind = (b.sourceKind === 'ocr' ? 'ocr' : 'text') as SourceKind
  const system = conformitySystem({ docType, missingMarker: MISSING_MARKER })
  const sourcePart: Part = { text: `DOCUMENT SOURCE :\n${sourceText}` }
  const source = prepareSource(sourceText, sourceKind)

  logJson({
    fn: 'bench',
    reqId,
    op: 'start',
    phase,
    docType,
    sections: wanted.length,
    concurrency,
    warmupFirst,
    chars: sourceText.length,
  })

  const report = await boundedMap(
    wanted,
    measured(
      (rubric, budgetMs) =>
        generateSection(generateParts, {
          spec,
          rubric,
          sourceParts: [sourcePart],
          source,
          system,
          countryCode: b.countryCode,
          provider: 'anthropic',
          budgetMs: Math.min(SECTION_BUDGET_MS, budgetMs),
        }),
      deadline,
    ),
    { concurrency, warmupFirst, deadline, minSliceMs: MIN_SLICE_MS },
  )

  const { items: measures, totals } = collect(report)
  logJson({
    fn: 'bench',
    reqId,
    op: 'done',
    phase,
    ms: report.ms,
    slowestMs: report.slowestMs,
    ok: report.ok,
    failed: report.failed,
    skipped: report.skipped,
    ...totals,
  })

  return json({
    reqId,
    phase,
    docType,
    concurrency,
    warmupFirst,
    sourceChars: sourceText.length,
    wave: {
      ms: report.ms,
      slowestMs: report.slowestMs,
      ok: report.ok,
      failed: report.failed,
      skipped: report.skipped,
    },
    totals,
    // Le temps total de l'invocation, mur compris : c'est LUI qui doit rester sous 150 s, pas la
    // seule durée du lot. Le prélude et la réponse comptent aussi.
    invocationMs: Date.now() - invokedAt,
    sections: measures.map((m, i) => ({
      sectionId: m.value?.sectionId ?? wanted[i].id,
      title: m.value?.title ?? wanted[i].title,
      ms: m.ms,
      skipped: m.skipped,
      error: m.error,
      usage: m.usage,
      ...(m.value
        ? {
          status: m.value.status,
          verdict: m.value.verdict,
          attempts: m.value.attempts,
          downgraded: m.value.downgraded,
          downgradeReason: m.value.downgradeReason,
          // Le CONTENU sort avec la mesure : le harnais en a besoin pour assembler le document,
          // traduire, puis bâtir la revue — l'état vit chez l'appelant, comme il vivra en base
          // chez le worker. Idem pour les valeurs non ancrées, qui nourrissent `figuresToVerify`.
          content: m.value.content,
          evidence: m.value.evidence,
          ungrounded: m.value.ungrounded,
          figuresAdvisory: m.value.figuresAdvisory,
        }
        : {}),
    })),
  })
})
