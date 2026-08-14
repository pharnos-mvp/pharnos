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
  /^https:\/\/app\.pharnos\.com$|^https:\/\/([a-z0-9-]+\.)?pharnos\.pages\.dev$|^http:\/\/localhost:\d+$/

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
    source_lang: string | null
    product_name: string | null
    error: string | null
    started_at?: string | null
    finished_at?: string | null
    source_name?: string | null
    deliverable_fr?: string | null
    deliverable_en?: string | null
    deliverable_report?: string | null
    deliverable_stats?: Record<string, number> | null
  }
  const selJob: string = corps.livrable
    ? 'id, phase, sections_total, source_kind, source_lang, product_name, error, started_at, finished_at, source_name, deliverable_fr, deliverable_en, deliverable_report, deliverable_stats'
    : 'id, phase, sections_total, source_kind, source_lang, product_name, error'
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
  // Le NOM DU PRODUIT (bandeau contexte du mockup) : dénormalisé sur le job par le worker dès que
  // la rubrique 1 aboutit — le sondage de 2 s ne requête JAMAIS la rubrique pour un texte qui ne
  // change plus (~150 allers-retours économisés par commande).
  let produit: string | null = job?.product_name ?? null
  if (job) {
    // ⚠️ JAMAIS le contenu des ~74 rubriques — mais son VERDICT, oui : `content->>status` fait
    // extraire les quelques caractères de `filled`/`partial`/`missing` PAR LA REQUÊTE, là où
    // l'ancienne sélection du contenu entier chargeait des centaines de kilo-octets. C'est ce qui
    // rend la liste « à statuts vivants » du mockup sondable toutes les deux secondes.
    const { data, error } = await sb
      .from('upgrade_sections')
      .select('section_id, phase, status, outcome:content->>status')
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
    produit,
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

  // Le nom du produit vient du job (dénormalisé) ; les jobs d'AVANT la migration `0093` ne le
  // portent pas — repli sur la rubrique 1, UNE fois, sur ce seul chemin. ⚠️ L'erreur est LUE :
  // muette, elle livrait cinq fichiers « document-… » sans nom de produit, sans un log.
  if (!produit) {
    const { data: rub1, error: rub1Err } = await sb
      .from('upgrade_sections')
      .select('texte:content->>content')
      .eq('job_id', j.id)
      .eq('phase', 'conformity')
      .eq('section_id', '1')
      .eq('status', 'done')
      .maybeSingle()
    if (rub1Err) {
      logJson({ ...log, status: 'produit_illisible', job: j.id.slice(0, 8) })
      return json({ error: 'db' }, 503, origin)
    }
    produit = produitDepuisRubrique1((rub1 as { texte?: string } | null)?.texte ?? undefined) || null
  }
  const slug = slugFrom(produit ?? '') || 'document'
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
    // LOT B3 : la langue SOURCE nomme l'archive (`_RCP Upgrade` / `_SmPC Upgrade`) ; les comptes
    // de l'écran de livraison sont FIGÉS à l'assemblage — `null` sur les jobs antérieurs, la page
    // masque alors les tuiles plutôt que d'inventer des chiffres.
    sourceLang: j.source_lang,
    stats: j.deliverable_stats ?? null,
    // La DURÉE RÉELLE du traitement (mockup : « terminé en 4 min 12 ») — mesurée entre le
    // lancement de la porte et la complétion, jamais estimée. `null` si l'un des deux manque.
    dureeS: j.started_at && j.finished_at
      ? Math.max(0, Math.round((Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000))
      : null,
  }

  logJson({ ...log, status: 'livrable', essai: commande.essai })
  return json({ ...resume, livrable }, 200, origin)
})
