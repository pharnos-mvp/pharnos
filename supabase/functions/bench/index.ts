// BANC D'ESSAI — mesure UNE VAGUE de rubriques là où vit la clé (jalon U0.2).
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
// CE QUE LE BANC NE FAIT PAS. Il ne juge pas la QUALITÉ des rubriques produites : il rend leur
// statut et leur verdict tels quels, sans les interpréter. Le jugement réglementaire appartient au
// harnais local (U0.3), qui compare aux références.
//
// FERMÉ PAR DÉFAUT. Sans `BENCH_TOKEN` posé, la fonction refuse tout — un banc qui coûte de l'IA
// à chaque appel ne doit jamais être ouvert par oubli.
import { specForDocType, flattenRubrics } from '../_shared/conformity-specs.ts'
import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex, timingSafeEqual } from '../_shared/share-auth.ts'
import { prepareSource, type SourceKind } from '../_shared/ai/evidence.ts'
import { conformitySystem } from '../_shared/ai/personas.ts'
import { boundedMap, DEFAULT_CONCURRENCY } from '../_shared/ai/pool.ts'
import { generateParts, type Part } from '../_shared/ai/provider.ts'
import { EDGE_WALL_CLOCK_MS } from '../_shared/ai/limits.ts'
import {
  generateSection,
  MISSING_MARKER,
  SECTION_BUDGET_MS,
} from '../_shared/upgrade-section-core.ts'
import { emptyUsage, runWithUsage, type Usage } from '../_shared/usage.ts'

const MAX_TEXT_CHARS = 60_000
/**
 * Marge sous le mur de 150 s. Elle couvre la lecture du corps (jusqu'à 60 000 caractères), la
 * sérialisation de la réponse et la latence de sortie. Un banc tué en 546 ne rendrait AUCUNE
 * mesure — l'échec le plus coûteux possible, puisque les appels IA auraient été payés.
 */
const BENCH_MARGIN_MS = 20_000
/** En deçà, une rubrique n'est pas lancée : un appel qui ne peut pas finir est un 546 déguisé. */
const MIN_SECTION_BUDGET_MS = 20_000

const enc = new TextEncoder()

interface SectionMeasure {
  sectionId: string
  title: string
  ms: number
  /** `null` quand la rubrique a échoué ou n'a pas été lancée. */
  status: string | null
  verdict: string | null
  attempts: number
  downgraded: boolean
  downgradeReason?: string
  ungrounded: number
  chars: number
  usage: Usage
  error?: string
  skipped: boolean
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
    sourceText?: string
    docType?: string
    countryCode?: string
    sourceKind?: string
    sections?: string[]
    concurrency?: number
    warmupFirst?: boolean
    limit?: number
  }

  const sourceText = typeof b.sourceText === 'string' ? b.sourceText.slice(0, MAX_TEXT_CHARS) : ''
  if (!sourceText) return json({ error: 'sourceText requis' }, 400)

  const docType = String(b.docType ?? 'rcp')
  const spec = specForDocType(docType)
  if (!spec) return json({ error: 'docType inconnu' }, 400)

  const all = flattenRubrics(spec)
  // Choix des rubriques : une liste explicite, sinon les N premières. Les mesurer TOUTES en une
  // invocation ne tiendrait pas sous 150 s — c'est précisément ce que le banc doit établir.
  const wanted = Array.isArray(b.sections) && b.sections.length
    ? all.filter((r) => b.sections!.includes(r.id))
    : all.slice(0, Math.max(1, Math.min(Number(b.limit) || DEFAULT_CONCURRENCY, all.length)))
  if (!wanted.length) return json({ error: 'aucune rubrique retenue' }, 400)

  const sourceKind = (b.sourceKind === 'ocr' ? 'ocr' : 'text') as SourceKind
  const concurrency = Math.max(1, Math.min(Number(b.concurrency) || DEFAULT_CONCURRENCY, 12))
  const warmupFirst = b.warmupFirst !== false
  const system = conformitySystem({ docType, missingMarker: MISSING_MARKER })
  const sourcePart: Part = { text: `DOCUMENT SOURCE :\n${sourceText}` }
  const source = prepareSource(sourceText, sourceKind)
  const deadline = invokedAt + EDGE_WALL_CLOCK_MS - BENCH_MARGIN_MS

  logJson({
    fn: 'bench',
    reqId,
    op: 'start',
    docType,
    sections: wanted.length,
    concurrency,
    warmupFirst,
    chars: sourceText.length,
  })

  const report = await boundedMap<typeof wanted[number], SectionMeasure>(
    wanted,
    async (rubric) => {
      // Accumulateur EXTERNALISÉ, comme en production : un appel payé puis suivi d'une erreur doit
      // rester compté. Un banc qui perd les jetons des rubriques en échec sous-estime le coût réel,
      // et c'est justement sur les rubriques difficiles que le rejeu double la facture.
      const usage = emptyUsage()
      const budgetMs = Math.min(SECTION_BUDGET_MS, deadline - Date.now())
      try {
        if (budgetMs < MIN_SECTION_BUDGET_MS) throw new Error('budget insuffisant')
        const s = await runWithUsage(usage, () =>
          generateSection(generateParts, {
            spec,
            rubric,
            sourceParts: [sourcePart],
            source,
            system,
            countryCode: b.countryCode,
            // Fournisseur ÉPINGLÉ, comme en production : le décodage contraint n'existe pas chez
            // tous les fournisseurs. Mesurer Vertex ici donnerait une durée sans rapport avec la
            // chaîne qui livrera.
            provider: 'anthropic',
            budgetMs,
          }))
        return {
          sectionId: s.sectionId,
          title: s.title,
          ms: 0, // renseigné par le pool, seule horloge qui mesure l'item entier
          status: s.status,
          verdict: s.verdict,
          attempts: s.attempts,
          downgraded: s.downgraded,
          downgradeReason: s.downgradeReason,
          ungrounded: s.ungrounded.length,
          chars: s.content.length,
          usage,
          skipped: false,
        }
      } catch (e) {
        return {
          sectionId: rubric.id,
          title: rubric.title ?? rubric.id,
          ms: 0,
          status: null,
          verdict: null,
          attempts: 0,
          downgraded: false,
          ungrounded: 0,
          chars: 0,
          usage,
          error: e instanceof Error ? e.message : String(e),
          skipped: false,
        }
      }
    },
    { concurrency, warmupFirst, deadline, minSliceMs: MIN_SECTION_BUDGET_MS },
  )

  // La durée d'un item n'est connue que du pool : on la recolle ici plutôt que de la mesurer dans
  // le worker, qui ne verrait pas l'attente en file d'attente.
  const sections: SectionMeasure[] = report.outcomes.map((o, i) => {
    const base = o.value ?? {
      sectionId: wanted[i].id,
      title: wanted[i].title ?? wanted[i].id,
      status: null,
      verdict: null,
      attempts: 0,
      downgraded: false,
      ungrounded: 0,
      chars: 0,
      usage: emptyUsage(),
      skipped: o.skipped,
      error: o.error?.message,
    }
    return { ...base, ms: o.ms, skipped: o.skipped }
  })

  const totals = sections.reduce(
    (a, s) => ({
      in: a.in + s.usage.in,
      out: a.out + s.usage.out,
      cacheRead: a.cacheRead + s.usage.cacheRead,
      cacheWrite: a.cacheWrite + s.usage.cacheWrite,
    }),
    emptyUsage(),
  )

  logJson({
    fn: 'bench',
    reqId,
    op: 'done',
    ms: report.ms,
    slowestMs: report.slowestMs,
    ok: report.ok,
    failed: report.failed,
    skipped: report.skipped,
    ...totals,
  })

  return json({
    reqId,
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
    sections,
  })
})
