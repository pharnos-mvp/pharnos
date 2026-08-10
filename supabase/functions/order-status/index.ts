// Edge Function `order-status` — ce que la page publique lit d'une commande (U3 suivi, U5 livraison).
//
// DEUX MODES, et la distinction est une décision de performance, pas de confort : la page interroge
// cette surface toutes les DEUX SECONDES pendant les cinq minutes de génération, soit ~150 requêtes
// par commande.
//   • défaut         — le résumé : quelques centaines d'octets, c'est ce que le suivi consomme.
//   • `?livrable=1`  — le contenu complet, demandé UNE fois, quand tout est terminé.
//
// Contrat de sécurité :
//   • `verify_jwt = false` — l'acheteur n'a pas de compte. Le jeton EST l'autorisation.
//   • **Aucune donnée personnelle ne sort d'ici** : ni e-mail, ni nom, ni identifiant de vente. Un
//     jeton se retrouve dans un historique de navigateur, un cache de proxy, une capture d'écran
//     envoyée au support — ce qu'on n'expose pas ne fuit pas.
//   • Débit borné large, mais borné : 150 requêtes légitimes par commande, et il faut laisser
//     passer plusieurs onglets ouverts sans casser le suivi de personne.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { commandeParJeton, estRefus, statutHttp } from '../_shared/order-access.ts'
import { produitDepuisRubrique1, slugFrom } from '../_shared/deliverable-markdown.ts'
import { resumer, type LigneSection } from '../_shared/order-status-core.ts'
import { MAX_DEPOTS } from '../_shared/orders-core.ts'

const RL_WINDOW_S = 600
/** ~150 requêtes par commande et par onglet : 900 laisse la place à plusieurs onglets et à un rejeu. */
const RL_IP_MAX = 900
const RL_GLOBAL_MAX = 20_000

const ALLOWED_ORIGIN =
  /^https:\/\/app\.pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos-app\.pages\.dev$|^http:\/\/localhost:\d+$/

const BASE_HEADERS = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
} as const

const cors = (o: string | null): Record<string, string> =>
  o && ALLOWED_ORIGIN.test(o) ? { ...BASE_HEADERS, 'Access-Control-Allow-Origin': o } : { ...BASE_HEADERS }

const json = (body: unknown, status: number, o: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Un état qui change toutes les deux secondes ne se met JAMAIS en cache : un proxy qui le
      // garderait figerait la barre de progression sur un chiffre mort.
      'cache-control': 'no-store',
      ...cors(o),
    },
  })

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const log = { fn: 'order-status', reqId: newReqId() }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)
  if (!origin || !ALLOWED_ORIGIN.test(origin)) return json({ error: 'forbidden' }, 403, origin)

  const annonce = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(annonce) && annonce > 4096) return json({ error: 'payload_too_large' }, 413, origin)

  let corps: Record<string, unknown>
  try {
    corps = JSON.parse(await req.text()) as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400, origin)
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const ip = req.headers.get('cf-connecting-ip')?.trim() ||
    (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ||
    'unknown'
  for (
    const [bucket, max] of [[`status:ip:${ip}`, RL_IP_MAX], ['status:all', RL_GLOBAL_MAX]] as const
  ) {
    const { data: hits, error } = await sb.rpc('share_hit', {
      p_bucket: bucket,
      p_window_seconds: RL_WINDOW_S,
    })
    if (error || typeof hits !== 'number' || hits > max) {
      logJson({ ...log, status: 'rate_limited' })
      return json({ error: 'rate_limited' }, 429, origin)
    }
  }

  const commande = await commandeParJeton(sb, corps.token)
  if (estRefus(commande)) return json({ error: commande.refus }, statutHttp(commande), origin)

  // Le job COURANT de la commande : le plus récent, puisqu'un nouveau dépôt en crée un nouveau et
  // que les rubriques du précédent portent l'analyse d'un AUTRE document.
  // Les markdowns ne sont sélectionnés qu'en mode livrable : ~100 Ko qui n'ont rien à faire dans
  // un sondage de deux secondes. (`returns<…>` : la sélection est calculée, le parseur de types de
  // supabase-js ne sait la lire que littérale.)
  interface JobRow {
    id: string
    phase: string
    sections_total: number
    source_kind: string
    error: string | null
    finished_at?: string | null
    source_name?: string | null
    deliverable_fr?: string | null
    deliverable_en?: string | null
    deliverable_report?: string | null
  }
  const selJob: string = corps.livrable
    ? 'id, phase, sections_total, source_kind, error, finished_at, source_name, deliverable_fr, deliverable_en, deliverable_report'
    : 'id, phase, sections_total, source_kind, error'
  const { data: jobs, error: jobErr } = await sb
    .from('upgrade_jobs')
    .select(selJob)
    .eq('order_id', commande.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .returns<JobRow[]>()
  if (jobErr) return json({ error: 'db' }, 503, origin)
  const job = jobs?.[0] ?? null

  let lignes: LigneSection[] = []
  if (job) {
    // ⚠️ JAMAIS le contenu des ~74 rubriques : les markdowns assemblés sont l'autorité depuis U5,
    // et seule la rubrique 1 sert encore ici (le nom du produit → slug). L'ancienne sélection
    // chargeait des centaines de kilo-octets pour en garder vingt caractères.
    const { data, error } = await sb
      .from('upgrade_sections')
      .select('section_id, phase, status')
      .eq('job_id', job.id)
    if (error) return json({ error: 'db' }, 503, origin)
    lignes = (data ?? []) as unknown as LigneSection[]
  }

  const resume = resumer(
    {
      status: commande.status,
      deposits_used: commande.depositsUsed,
      delivery_expires_at: commande.expiresAt,
      doc_type: commande.docType,
      country: commande.country,
      activity: commande.activity,
    },
    job,
    lignes,
    MAX_DEPOTS,
  )

  if (!corps.livrable) {
    return json({ ...resume, jobId: job?.id ?? null, erreur: job?.error ?? null }, 200, origin)
  }

  // ── Le livrable ───────────────────────────────────────────────────────────────────────────────
  if (!resume.pret) {
    // Demander le livrable avant la fin n'est pas une erreur du client : c'est une course entre son
    // dernier sondage et la fin du travail. On rend le résumé, il réessaiera.
    return json({ ...resume, livrable: null }, 200, origin)
  }
  // ── U5 : les MARKDOWNS du serveur sont l'autorité ─────────────────────────────────────────────
  //
  // ⚠️ Le JSON de rubriques ne suffisait pas — `renderReportMarkdown` calcule la liste des lacunes
  // depuis les STATUTS, que `assembler()` ne rendait pas, et le squelette de la revue serait alors
  // recalculé par le navigateur : le défaut de `d224665`. Le serveur assemble à la complétion
  // (`job-tick`), cette surface ne fait que SERVIR. Un job `done` sans markdowns est un état
  // impossible depuis `0088` (l'écriture précède la bascule) : le rencontrer est une panne franche,
  // qui se dit — jamais un repli sur l'ancien JSON, qui livrerait un rapport différent de celui que
  // le banc d'essai a validé.
  const j = job
  if (!j?.deliverable_fr || !j.deliverable_en || !j.deliverable_report) {
    logJson({ ...log, status: 'livrable_absent', job: j?.id?.slice(0, 8) })
    return json({ ...resume, livrable: null, erreur: 'livrable introuvable' }, 409, origin)
  }

  // Le nom du produit se dérive de la rubrique 1 — même règle que l'assemblage : le nom des
  // fichiers téléchargés doit porter le produit, pas un identifiant technique. UNE ligne, pas 74.
  const { data: rub1 } = await sb
    .from('upgrade_sections')
    .select('content')
    .eq('job_id', j.id)
    .eq('phase', 'conformity')
    .eq('section_id', '1')
    .maybeSingle()
  const produit = produitDepuisRubrique1(
    (rub1?.content as { content?: string } | null)?.content,
  )
  const slug = slugFrom(produit) || 'document'
  const reportLang = commande.lang
  const livrable = {
    fr: j.deliverable_fr,
    en: j.deliverable_en,
    rapport: j.deliverable_report,
    slug,
    reportHeader: produit
      ? (reportLang === 'en' ? `${produit} — Regulatory Review` : `${produit} — Revue réglementaire`)
      : (reportLang === 'en' ? 'Regulatory Review' : 'Revue réglementaire'),
    reportLang,
    // ⚠️ La date de RENDU vient du serveur, la MÊME pour le navigateur et pour le banc d'essai :
    // c'est elle qui rend les PDF reproductibles à l'octet (recette U5). `pdf-lib` horodate sinon
    // à la seconde de la fabrication, et deux rendus du même contenu divergent.
    created: j.finished_at ?? null,
    sourceKind: j.source_kind,
  }

  logJson({ ...log, status: 'livrable', essai: commande.essai })
  return json({ ...resume, livrable }, 200, origin)
})
