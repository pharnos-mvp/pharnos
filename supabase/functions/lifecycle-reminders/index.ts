// Edge Function `lifecycle-reminders` (LOT 10) — relances AUTOMATIQUES du cycle de vie.
// Déclenchée chaque nuit par pg_cron → pg_net (migration 0050), JAMAIS par un navigateur.
//
// Contrat sécurité :
//   • verify_jwt = false (config.toml) : l'appelant n'est pas un utilisateur. La barrière est le
//     secret partagé `x-cron-secret` (256 bits hex, généré CÔTÉ SERVEUR dans Vault — source
//     UNIQUE) : la fonction compare le header au HASH SHA-256 du secret via la RPC service-role
//     `lifecycle_cron_secret_hash` (migration 0051) — aucun secret d'environnement à synchroniser,
//     rotation = update Vault. Comparaison à temps constant (timingSafeEqual) ; garde de FORME
//     (64 hex) avant tout appel DB ; Vault vide → 503 fail-closed.
//   • Écritures en service-role : INSERT `lifecycle_events` actor_id='system' — le journal reste
//     append-only pour l'API authentifiée (aucune policy nouvelle), le système écrit par le même
//     canal que l'Edge `share`.
//   • Relance réellement ADRESSÉE : T1 au DESTINATAIRE (recipient de la correspondance) dans SA
//     langue (défaut = langue du pays), expéditeur « {Org} (via Pharnos) », Reply-To = l'émetteur
//     (les réponses de l'agent lui reviennent) ; T2 = accusé à l'émetteur. Aucun lien tokenisé
//     (non reconstructible côté serveur — ADR-0003) : T1 renvoie au lien déjà communiqué. Sans
//     destinataire connu → pense-bête historique au labo (dégradation).
//   • Auto-idempotent : l'événement relance REPART le compteur d'attente → un rejeu du cron le
//     même jour ne double-tire pas (waiting_days retombe sous le seuil).
//
// Perf/échelle : scan paginé des dossiers + requêtes par lots (jamais de N+1). Au MVP (dizaines
// de dossiers) le run est < 1 s ; à 100×, le goulot = le scan complet nocturne → pré-filtrer en
// SQL (dossiers avec activité < seuil min) avant de charger les lots. Noté, pas construit.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex, timingSafeEqual } from '../_shared/share-auth.ts'
import {
  COUNTRY_NAMES,
  DEFAULT_ORG_CFG,
  officialLang,
  orgReminderCfg,
  planReminder,
  recipientAction,
  senderDisplayName,
  type MsgLang,
  type OrgReminderCfg,
  type ReminderCorrRow,
  type ReminderDecisionMsgRow,
  type ReminderDossierRow,
  type ReminderEventRow,
  type ReminderPlan,
  type ReminderSettingsRow,
} from '../_shared/lifecycle-reminders-core.ts'
import {
  planManufacturerReminders,
  type ManufacturerReminderPlan,
  type MonitorDocRow,
  type MonitorPartyRow,
  type MonitorProductRow,
  type MonitorSentRow,
} from '../_shared/monitoring-reminders-core.ts'

const PAGE_SIZE = 1000
const ID_CHUNK = 100
const INSERT_CHUNK = 200
// Caps e-mail : best-effort, jamais bloquants pour la journalisation.
const MAIL_MAX_PER_RUN = 50
const MAIL_ORG_WINDOW_S = 86_400
const MAIL_ORG_MAX_PER_DAY = 10
// Caps DÉDIÉS à la relance fabricant (domaine B) — compteur séparé de la relance Roadmap.
const MONITOR_MAX_PER_RUN = 50
const MONITOR_ORG_WINDOW_S = 86_400
const MONITOR_ORG_MAX_PER_DAY = 10
// Libellés bilingues des pièces à préavis (corps d'e-mail fabricant) — repli = code.
const MONITOR_DOC_LABELS: Record<string, { fr: string; en: string }> = {
  amm: { fr: 'AMM', en: 'MA' },
  gmp: { fr: 'certificat GMP', en: 'GMP certificate' },
  copp: { fr: 'COPP', en: 'CPP' },
  fsc: { fr: 'FSC', en: 'FSC' },
  ml: { fr: 'licence d’établissement (ML)', en: 'establishment licence (ML)' },
  coa: { fr: 'certificat d’analyse (COA)', en: 'certificate of analysis (CoA)' },
}
// Adresse « stricte » : exclut aussi les métacaractères d'en-tête (`"'<>,;:`) — durcissement (revue
// M2), aligné sur `redactEmails`. Empêche qu'une adresse libre saisie casse un jour un en-tête.
const EMAIL_RE = /^[^\s@"'<>,;:]+@[^\s@"'<>,;:]+\.[^\s@"'<>,;:]+$/

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

Deno.serve(async (req: Request) => {
  const reqId = newReqId()
  const log = { fn: 'lifecycle-reminders', reqId }
  const started = Date.now()
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': reqId },
    })

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Barrière d'accès : garde de FORME d'abord (64 hex — l'endpoint est public, aucun appel DB
  // pour du spam), puis comparaison à temps constant contre le HASH du secret Vault (RPC 0051,
  // service-role only). Une seule source de vérité, aucun secret d'environnement à synchroniser.
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!/^[0-9a-f]{64}$/.test(given)) {
    logJson({ ...log, status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  const { data: expectedHash, error: hashErr } = await supabase.rpc('lifecycle_cron_secret_hash')
  if (hashErr || typeof expectedHash !== 'string' || expectedHash.length !== 64) {
    // Vault vide ou RPC absente : la relance auto n'est pas configurée → fail-closed, visible.
    logJson({ ...log, status: 'config_missing' })
    return json({ error: 'unavailable' }, 503)
  }
  const enc = new TextEncoder()
  if (!timingSafeEqual(enc.encode(await sha256Hex(given)), enc.encode(expectedHash))) {
    logJson({ ...log, status: 'unauthorized' })
    return json({ error: 'unauthorized' }, 401)
  }

  let dryRun = false
  try {
    const body = await req.json().catch(() => ({}))
    dryRun = (body as { dryRun?: unknown })?.dryRun === true
  } catch {
    // corps vide/illisible : exécution normale
  }

  try {
    const now = new Date()
    const plans: ReminderPlan[] = []
    const products = new Map<string, ReminderDossierRow>()
    let scanned = 0

    // Config des relances par org (0055) — petite table (1 ligne/org) : un seul SELECT, mappé.
    // Org sans ligne = défauts. Le service-role bypasse la RLS.
    const cfgByOrg = new Map<string, OrgReminderCfg>()
    {
      const { data: cfgRows, error: cfgErr } = await supabase
        .from('reminder_settings')
        .select(
          'org_id, roadmap_auto_enabled, roadmap_agent_days, roadmap_agency_days, roadmap_email_enabled, monitoring_auto_enabled, monitoring_lead_days',
        )
      if (cfgErr) throw cfgErr
      for (const r of (cfgRows ?? []) as ReminderSettingsRow[]) {
        cfgByOrg.set(r.org_id, orgReminderCfg(r))
      }
    }
    const cfgFor = (orgId: string): OrgReminderCfg => cfgByOrg.get(orgId) ?? DEFAULT_ORG_CFG

    // Noms d'organisation (expéditeur « {Org} (via Pharnos) ») — petit référentiel, un SELECT best-effort.
    const orgName = new Map<string, string>()
    {
      const { data: orgs } = await supabase.from('orgs').select('id, name')
      for (const o of (orgs ?? []) as { id: string; name: string | null }[]) {
        if (o.name) orgName.set(o.id, o.name)
      }
    }

    // Scan paginé des dossiers vivants (toutes orgs — tâche plateforme, volumes MVP faibles).
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: dossiers, error } = await supabase
        .from('dossiers')
        .select('id, org_id, product_name, country, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = (dossiers ?? []) as ReminderDossierRow[]
      if (page.length === 0) break
      scanned += page.length

      const ids = page.map((d) => d.id)
      const corrs: ReminderCorrRow[] = []
      const events: ReminderEventRow[] = []
      for (const part of chunk(ids, ID_CHUNK)) {
        const [corrRes, evRes] = await Promise.all([
          supabase
            .from('correspondences')
            .select(
              'id, dossier_id, status, created_at, updated_at, decided_at, revoked_at, deleted_at, sender_email, recipient_email, recipient_lang',
            )
            .is('deleted_at', null)
            .in('dossier_id', part),
          supabase
            .from('lifecycle_events')
            .select('dossier_id, type, actor_id, occurred_at')
            .in('dossier_id', part),
        ])
        if (corrRes.error) throw corrRes.error
        if (evRes.error) throw evRes.error
        corrs.push(...((corrRes.data ?? []) as ReminderCorrRow[]))
        events.push(...((evRes.data ?? []) as ReminderEventRow[]))
      }

      // Messages de décision (immuables) des correspondances chargées — horloge de la boucle M4.
      const decisionMessages: ReminderDecisionMsgRow[] = []
      for (const part of chunk(corrs.map((c) => c.id), ID_CHUNK)) {
        const { data, error: msgErr } = await supabase
          .from('correspondence_messages')
          .select('correspondence_id, created_at')
          .eq('kind', 'decision')
          .in('correspondence_id', part)
        if (msgErr) throw msgErr
        decisionMessages.push(...((data ?? []) as ReminderDecisionMsgRow[]))
      }

      for (const dossier of page) {
        const cfg = cfgFor(dossier.org_id)
        if (!cfg.roadmapAutoEnabled) continue // org a désactivé les relances auto Roadmap (0055)
        const plan = planReminder({
          dossier,
          correspondences: corrs,
          events,
          decisionMessages,
          now,
          thresholds: cfg.thresholds,
        })
        if (plan) {
          plans.push(plan)
          products.set(plan.dossierId, dossier)
        }
      }
      if (page.length < PAGE_SIZE) break
    }

    // Journalisation : `reminder_sent` actor 'system' — même dialecte de payload que M5 (+ seuil).
    let inserted = 0
    if (!dryRun && plans.length > 0) {
      const nowIso = new Date().toISOString()
      const rows = plans.map((p) => ({
        id: crypto.randomUUID(),
        org_id: p.orgId,
        dossier_id: p.dossierId,
        type: 'reminder_sent',
        actor_id: 'system',
        actor_email: '',
        occurred_at: nowIso,
        payload: { stage: p.stage, waiting_days: p.waitingDays, threshold_days: p.thresholdDays },
        created_at: nowIso,
      }))
      for (const part of chunk(rows, INSERT_CHUNK)) {
        const { error } = await supabase.from('lifecycle_events').insert(part)
        if (error) throw error
        inserted += part.length
      }
    }

    // E-mails best-effort (côté labo) — plafonnés par run et par org/jour ; jamais bloquants.
    // Canal e-mail filtré par org (0055) : la journalisation in-app (INSERT reminder_sent) reste
    // faite pour TOUTES les relances ; seul l'envoi e-mail respecte le toggle par org.
    let emailed = 0
    if (!dryRun) {
      const emailPlans = plans.filter((p) => cfgFor(p.orgId).emailEnabled)
      emailed = await sendEmails(supabase, emailPlans, products, orgName, log)
    }

    // ── Pass MONITORING (domaine B, Slice 2b) — relance FABRICANT des pièces admin qui expirent.
    // ISOLÉ dans son propre try/catch : une panne du monitoring (données B) ne casse JAMAIS la relance
    // Roadmap déjà journalisée/envoyée ci-dessus, ni la réponse du cron. Best-effort, plafonné, idempotent.
    let monitorScanned = 0
    let manufacturerReminders = 0
    try {
      const m = await runMonitoringPass(supabase, cfgFor, orgName, dryRun, now, log)
      monitorScanned = m.scanned
      manufacturerReminders = m.sent
    } catch (e) {
      logJson({
        ...log,
        op: 'monitoring',
        status: 'error',
        err: String(e instanceof Error ? e.message : e).slice(0, 300),
      })
    }

    const out = {
      scanned,
      planned: plans.length,
      inserted,
      emailed,
      monitorScanned,
      manufacturerReminders,
      dryRun,
    }
    logJson({ ...log, ...out, ms: Date.now() - started, status: 'ok' })
    return json(out)
  } catch (e) {
    logJson({
      ...log,
      ms: Date.now() - started,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500)
  }
})

/** Compteur de fenêtre partagé (0017) ; `null` = échec technique → traité comme plafonné (fail-closed). */
async function rateHit(
  supabase: SupabaseClient,
  bucket: string,
  windowSeconds: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('share_hit', {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    logJson({ fn: 'lifecycle-reminders', op: 'rate', status: 'error', err: error.message.slice(0, 120) })
    return null
  }
  return typeof data === 'number' ? data : null
}

/**
 * Lecture SEULE du compteur de fenêtre courante (même calcul de fenêtre fixe que `share_hit`) —
 * ne consomme RIEN. Le quota n'est brûlé (`rateHit`) qu'APRÈS un envoi RÉUSSI : un échec Resend
 * ou un e-mail supprimé par le cap ne mange jamais le plafond des relances légitimes (revue M1).
 * `null` = échec technique → fail-closed (on n'envoie pas).
 */
async function peekHits(
  supabase: SupabaseClient,
  bucket: string,
  windowSeconds: number,
): Promise<number | null> {
  const windowStart = new Date(
    Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds * 1000,
  ).toISOString()
  const { data, error } = await supabase
    .from('share_hits')
    .select('hits')
    .eq('bucket', bucket)
    .eq('window_start', windowStart)
    .maybeSingle()
  if (error) {
    logJson({ fn: 'lifecycle-reminders', op: 'rate_peek', status: 'error', err: error.message.slice(0, 120) })
    return null
  }
  return (data as { hits?: number } | null)?.hits ?? 0
}

/** Assainit une valeur destinée à un EN-TÊTE d'e-mail (anti header-injection : jamais de CR/LF). */
const headerLine = (s: string): string => s.replace(/[\r\n]+/g, ' ')

/** Redacte toute adresse e-mail d'un texte de log (posture repo : zéro PII dans les logs). */
const redactEmails = (s: string): string =>
  s.replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, '<email>')

/** Partie attendue, fléchie, MONOLINGUE (dégradation / repli). */
const partyLabel = (waitingOn: 'agent' | 'agency', lang: MsgLang): string =>
  waitingOn === 'agent'
    ? lang === 'fr'
      ? 'l’agent local'
      : 'the local agent'
    : lang === 'fr'
      ? 'l’agence nationale'
      : 'the national agency'

/** T1 — sujet de la relance au destinataire (monolingue), à assainir par `headerLine`. */
function relanceSubject(product: string, country: { fr: string; en: string }, lang: MsgLang): string {
  return lang === 'fr'
    ? `Relance — dossier ${product} (${country.fr})`
    : `Reminder — dossier ${product} (${country.en})`
}

/** T1 — relance au DESTINATAIRE (agent/agence), MONOLINGUE. `safeProduct`/`orgHtml` déjà échappés. */
function relanceHtml(
  safeProduct: string,
  country: { fr: string; en: string },
  plan: ReminderPlan,
  lang: MsgLang,
  orgHtml: string,
): string {
  const c = escapeHtml(lang === 'fr' ? country.fr : country.en)
  const foot = lang === 'fr' ? 'Envoyé via Pharnos' : 'Sent via Pharnos'
  const inner =
    lang === 'fr'
      ? `<p style="margin:0 0 12px">Bonjour,</p>` +
        `<p style="margin:0 0 12px">Le dossier <strong>${safeProduct}</strong> (${c}) est en attente de votre traitement depuis <strong>${plan.waitingDays} jours</strong>.</p>` +
        `<p style="margin:0 0 12px">Nous vous serions reconnaissants de bien vouloir ${recipientAction(plan.stage, 'fr')}.</p>` +
        `<p style="margin:0 0 12px">Pour rappel, le dossier reste accessible via le lien qui vous a été communiqué.</p>` +
        `<p style="margin:16px 0 0">Cordialement,<br><strong>${orgHtml}</strong></p>`
      : `<p style="margin:0 0 12px">Hello,</p>` +
        `<p style="margin:0 0 12px">The dossier <strong>${safeProduct}</strong> (${c}) has been awaiting your action for <strong>${plan.waitingDays} days</strong>.</p>` +
        `<p style="margin:0 0 12px">We would be grateful if you could ${recipientAction(plan.stage, 'en')}.</p>` +
        `<p style="margin:0 0 12px">As a reminder, the dossier remains accessible via the link previously shared with you.</p>` +
        `<p style="margin:16px 0 0">Best regards,<br><strong>${orgHtml}</strong></p>`
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#444">${inner}<p style="margin:24px 0 0;color:#aaa;font-size:11px">${foot}</p></div>`
}

/** T2 — accusé à l'ÉMETTEUR (MAH) — EN monolingue (règle CEO : MAH = EN). */
function ackHtml(safeProduct: string, country: { fr: string; en: string }, plan: ReminderPlan): string {
  return (
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#444">` +
    `<p style="margin:0 0 12px">Hello,</p>` +
    `<p style="margin:0 0 12px">Your reminder for dossier <strong>${safeProduct}</strong> (${escapeHtml(country.en)}) has been sent to your correspondent.</p>` +
    `<p style="margin:0 0 12px;color:#888;font-size:13px">Waiting for ${plan.waitingDays} day(s) (threshold: ${plan.thresholdDays} d). Any reply from your correspondent will reach you directly (Reply-To).</p>` +
    `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — the OS for pharmaceutical regulatory affairs in UEMOA/ECOWAS</p>` +
    `</div>`
  )
}

/** Dégradation — pense-bête au labo (MAH) quand le destinataire est inconnu — EN monolingue (règle CEO : MAH = EN). */
function selfReminderHtml(
  safeProduct: string,
  country: { fr: string; en: string },
  plan: ReminderPlan,
  roadmapUrl: string,
): string {
  return [
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">`,
    `<h2 style="margin:0 0 8px">Automatic reminder</h2>`,
    `<p style="margin:0 0 16px;color:#444">The dossier <strong>${safeProduct}</strong> (${escapeHtml(country.en)}) has been waiting on <strong>${partyLabel(plan.waitingOn, 'en')}</strong> for <strong>${plan.waitingDays} day(s)</strong> (threshold: ${plan.thresholdDays} d).</p>`,
    `<p style="margin:0 0 16px;color:#444">No recipient email on file — follow up manually, or add the address under “Reminders”.</p>`,
    `<p style="margin:0 0 24px"><a href="${roadmapUrl}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Open the dossier roadmap</a></p>`,
    `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — the OS for pharmaceutical regulatory affairs in UEMOA/ECOWAS</p>`,
    `</div>`,
  ].join('')
}

/**
 * Envoie les e-mails de relance — best-effort, plafonné (run + org/jour), jamais bloquant pour la
 * journalisation. Deux messages quand le DESTINATAIRE est connu : T1 (au destinataire, sa langue,
 * expéditeur « {Org} (via Pharnos) », Reply-To émetteur) + T2 (accusé émetteur). Sinon : pense-bête
 * historique au labo (dégradation). Le quota n'est brûlé qu'APRÈS un envoi RÉUSSI (revue M1).
 */
async function sendEmails(
  supabase: SupabaseClient,
  plans: ReminderPlan[],
  products: Map<string, ReminderDossierRow>,
  orgName: Map<string, string>,
  log: Record<string, unknown>,
): Promise<number> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    if (plans.length > 0) logJson({ ...log, op: 'email', status: 'email_unavailable' })
    return 0
  }
  const fromRaw = Deno.env.get('EMAIL_FROM')
  if (!fromRaw && plans.length > 0) {
    // Défaut bac-à-sable Resend = livrable au seul propriétaire du compte → en prod, chaque envoi
    // échouerait en silence. On le dit UNE fois, fort (même piège que le SMTP auth, config.toml).
    logJson({ ...log, op: 'email', status: 'email_from_unconfigured' })
  }
  const fromField = fromRaw ?? 'Pharnos <onboarding@resend.dev>'
  const addrMatch = fromField.match(/<([^>]+)>/)
  const fromAddress = (addrMatch ? addrMatch[1] : fromField).trim()
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://app.pharnos.com').replace(/\/+$/, '')

  let sent = 0
  // Plafond par org/jour : lecture SEULE du compteur (peek) + comptage local des succès de CE run ;
  // le quota n'est brûlé qu'après un envoi RÉUSSI (revue M1 — jamais sur échec ni suppression).
  const orgBase = new Map<string, number | null>()
  const orgSent = new Map<string, number>()

  // Envoie UN e-mail sous les plafonds ; ne consomme le quota qu'au succès. `false` = non envoyé.
  const trySend = async (
    orgId: string,
    msg: { from: string; to: string[]; reply_to?: string[]; subject: string; html: string },
  ): Promise<boolean> => {
    if (sent >= MAIL_MAX_PER_RUN) return false
    let base = orgBase.get(orgId)
    if (base === undefined) {
      base = await peekHits(supabase, `autorem:${orgId}`, MAIL_ORG_WINDOW_S)
      orgBase.set(orgId, base)
    }
    const already = orgSent.get(orgId) ?? 0
    // `base === null` = compteur illisible → fail-closed (pas d'envoi).
    if (base === null || base + already >= MAIL_ORG_MAX_PER_DAY) return false
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(msg),
    })
    if (res.ok) {
      sent++
      orgSent.set(orgId, already + 1)
      void rateHit(supabase, `autorem:${orgId}`, MAIL_ORG_WINDOW_S)
      return true
    }
    // Le corps d'erreur Resend peut écho-er l'adresse destinataire → PII redactée avant log.
    const detail = redactEmails((await res.text().catch(() => '')).slice(0, 200))
    logJson({ ...log, op: 'email', status: 'email_failed', code: res.status, detail })
    return false
  }

  for (const plan of plans) {
    if (sent >= MAIL_MAX_PER_RUN) {
      logJson({ ...log, op: 'email', status: 'run_cap_reached', skipped: plans.length - sent })
      break
    }
    const dossier = products.get(plan.dossierId)
    if (!dossier) continue

    const country = COUNTRY_NAMES[dossier.country] ?? { fr: dossier.country, en: dossier.country }
    const safeProduct = escapeHtml(dossier.product_name)
    const rawOrg = orgName.get(plan.orgId) ?? 'Pharnos'
    const hasSender = !!plan.senderEmail && EMAIL_RE.test(plan.senderEmail)
    const hasRecipient = !!plan.recipientEmail && EMAIL_RE.test(plan.recipientEmail)

    if (hasRecipient) {
      // Langue CHOISIE à l'envoi (Slice 1b) si présente et valide, sinon langue officielle du pays.
      const lang = plan.recipientLang ?? officialLang(dossier.country)
      // T1 — relance au destinataire, expéditeur « {Org} (via Pharnos) », Reply-To = émetteur.
      await trySend(plan.orgId, {
        from: `${senderDisplayName(rawOrg)} <${fromAddress}>`,
        to: [plan.recipientEmail as string],
        reply_to: hasSender ? [plan.senderEmail as string] : undefined,
        subject: headerLine(relanceSubject(dossier.product_name, country, lang)),
        html: relanceHtml(safeProduct, country, plan, lang, escapeHtml(rawOrg)),
      })
      // T2 — accusé à l'émetteur.
      if (hasSender) {
        await trySend(plan.orgId, {
          from: `Pharnos <${fromAddress}>`,
          to: [plan.senderEmail as string],
          subject: headerLine(`Reminder sent — ${dossier.product_name}`),
          html: ackHtml(safeProduct, country, plan),
        })
      }
    } else if (hasSender) {
      // Dégradation : destinataire inconnu → pense-bête historique au labo (avec lien Roadmap).
      const roadmapUrl = `${appUrl}/workspace/${encodeURIComponent(plan.dossierId)}/roadmap`
      await trySend(plan.orgId, {
        from: `Pharnos <${fromAddress}>`,
        to: [plan.senderEmail as string],
        subject: headerLine(
          `Reminder — dossier ${dossier.product_name} (${country.en}): ${plan.waitingDays} day(s) without activity`,
        ),
        html: selfReminderHtml(safeProduct, country, plan, roadmapUrl),
      })
    }
  }
  return sent
}

// ─────────────────────────── Pass MONITORING (domaine B, Slice 2b) ───────────────────────────

/** Libellé bilingue d'un type de pièce (corps d'e-mail fabricant) ; repli = code. */
const monitorDocLabel = (docType: string, lang: MsgLang): string =>
  MONITOR_DOC_LABELS[docType]?.[lang] ?? docType

/** Sujet (une ligne, à assainir par `headerLine`) de la relance fabricant — EN (règle CEO : fabricant = EN). */
function monitorSubject(plan: ManufacturerReminderPlan): string {
  return `Renewal reminder — ${monitorDocLabel(plan.docType, 'en')} · ${plan.productName}`
}

/** Corps EN monolingue (règle CEO : fabricant = EN, plus de bilingue) — `orgHtml` déjà échappé. */
function monitorHtml(plan: ManufacturerReminderPlan, orgHtml: string): string {
  const docEn = escapeHtml(monitorDocLabel(plan.docType, 'en'))
  const product = escapeHtml(plan.productName)
  const exp = escapeHtml(plan.expiryDate)
  const n = Math.abs(plan.daysLeft)
  const enWhen = plan.daysLeft >= 0 ? `expires in ${n} day(s)` : `expired ${n} day(s) ago`
  return [
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#444">`,
    `<p style="margin:0 0 12px">Hello,</p>`,
    `<p style="margin:0 0 12px">The <strong>${docEn}</strong> for product <strong>${product}</strong> ${enWhen} (expiry date ${exp}). Please initiate its renewal to avoid any compliance gap.</p>`,
    `<p style="margin:16px 0 0">Best regards,<br><strong>${orgHtml}</strong></p>`,
    // Pas de Reply-To (aucun contact RA MAH structuré en v1) → on le dit honnêtement au destinataire.
    `<p style="margin:16px 0 0;color:#999;font-size:12px">Automated message — for any question, please contact your usual point of contact.</p>`,
    `<p style="margin:24px 0 0;color:#aaa;font-size:11px">Sent via Pharnos</p>`,
    `</div>`,
  ].join('')
}

/**
 * Pass monitoring : scanne les pièces admin datées (service-role), résout produit → fabricant →
 * contact, planifie (cœur pur) PAR ORG (préavis + toggle propres à l'org), puis envoie. Requêtes par
 * lots (jamais de N+1). Renvoie le nombre de pièces scannées + d'e-mails envoyés.
 */
async function runMonitoringPass(
  supabase: SupabaseClient,
  cfgFor: (orgId: string) => OrgReminderCfg,
  orgName: Map<string, string>,
  dryRun: boolean,
  now: Date,
  log: Record<string, unknown>,
): Promise<{ scanned: number; sent: number }> {
  // 1) Pièces ADMIN datées, vivantes (le sous-ensemble à préavis) — scan paginé.
  const docs: MonitorDocRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, org_id, product_id, doc_type, expiry_date')
      .eq('category', 'admin')
      .is('deleted_at', null)
      .not('expiry_date', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as MonitorDocRow[]
    docs.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  if (docs.length === 0) return { scanned: 0, sent: 0 }

  // 2) Produits liés (fabricant) puis 3) fabricants (contact) — par lots d'ids.
  const productIds = [...new Set(docs.map((d) => d.product_id).filter((x): x is string => !!x))]
  const products: MonitorProductRow[] = []
  for (const part of chunk(productIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, nom_commercial, fabricant_id')
      .is('deleted_at', null) // produit retiré → plus de relance (soft-delete ≠ ON DELETE SET NULL)
      .in('id', part)
    if (error) throw error
    products.push(...((data ?? []) as MonitorProductRow[]))
  }
  const fabricantIds = [
    ...new Set(products.map((p) => p.fabricant_id).filter((x): x is string => !!x)),
  ]
  const parties: MonitorPartyRow[] = []
  for (const part of chunk(fabricantIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('parties')
      .select('id, nom, contact_email')
      .is('deleted_at', null) // fabricant retiré par l'org → aucune relance (cohérence avec l'app)
      .in('id', part)
    if (error) throw error
    parties.push(...((data ?? []) as MonitorPartyRow[]))
  }

  // 4) Idempotence : couples (pièce, échéance) déjà relancés.
  const alreadySent: MonitorSentRow[] = []
  for (const part of chunk(docs.map((d) => d.id), ID_CHUNK)) {
    const { data, error } = await supabase
      .from('monitoring_reminders')
      .select('document_id, expiry_date')
      .in('document_id', part)
    if (error) throw error
    alreadySent.push(...((data ?? []) as MonitorSentRow[]))
  }

  // 5) Planification PAR ORG (préavis + toggle propres à l'org). Org monitoring coupé → ignorée.
  const docsByOrg = new Map<string, MonitorDocRow[]>()
  for (const d of docs) {
    const arr = docsByOrg.get(d.org_id)
    if (arr) arr.push(d)
    else docsByOrg.set(d.org_id, [d])
  }
  const plans: ManufacturerReminderPlan[] = []
  for (const [orgId, orgDocs] of docsByOrg) {
    const cfg = cfgFor(orgId)
    if (!cfg.monitoringEnabled) continue
    plans.push(
      ...planManufacturerReminders({
        documents: orgDocs,
        products,
        parties,
        leadCfg: cfg.monitoringLeadDays,
        alreadySent,
        now,
      }),
    )
  }

  if (dryRun || plans.length === 0) return { scanned: docs.length, sent: 0 }
  const sent = await sendManufacturerReminders(supabase, plans, orgName, log)
  return { scanned: docs.length, sent }
}

/**
 * Envoie les relances fabricant — best-effort, plafonné (run + org/jour, buckets DÉDIÉS `monrem:`),
 * jamais bloquant. Sur envoi RÉUSSI : journalise dans `monitoring_reminders` (idempotence : plus
 * jamais de relance pour ce couple pièce/échéance) et brûle le quota. Un échec ne mange pas le quota
 * et laisse la pièce éligible au prochain run.
 */
async function sendManufacturerReminders(
  supabase: SupabaseClient,
  plans: ManufacturerReminderPlan[],
  orgName: Map<string, string>,
  log: Record<string, unknown>,
): Promise<number> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    if (plans.length > 0) logJson({ ...log, op: 'monitoring', status: 'email_unavailable' })
    return 0
  }
  const fromRaw = Deno.env.get('EMAIL_FROM')
  if (!fromRaw && plans.length > 0) {
    // Sandbox Resend = livrable au seul propriétaire → en prod, tout envoi fabricant échoue en silence.
    logJson({ ...log, op: 'monitoring', status: 'email_from_unconfigured' })
  }
  const fromField = fromRaw ?? 'Pharnos <onboarding@resend.dev>'
  const addrMatch = fromField.match(/<([^>]+)>/)
  const fromAddress = (addrMatch ? addrMatch[1] : fromField).trim()

  let sent = 0
  const orgBase = new Map<string, number | null>()
  const orgSent = new Map<string, number>()

  for (const plan of plans) {
    if (sent >= MONITOR_MAX_PER_RUN) {
      logJson({ ...log, op: 'monitoring', status: 'run_cap_reached', skipped: plans.length - sent })
      break
    }
    // Adresse re-validée côté serveur (en-têtes Resend + interpolation) — jamais de confiance aveugle.
    if (!EMAIL_RE.test(plan.contactEmail)) {
      logJson({ ...log, op: 'monitoring', status: 'bad_contact' })
      continue
    }
    let base = orgBase.get(plan.orgId)
    if (base === undefined) {
      base = await peekHits(supabase, `monrem:${plan.orgId}`, MONITOR_ORG_WINDOW_S)
      orgBase.set(plan.orgId, base)
    }
    const already = orgSent.get(plan.orgId) ?? 0
    if (base === null || base + already >= MONITOR_ORG_MAX_PER_DAY) continue // fail-closed / plafond org

    const rawOrg = orgName.get(plan.orgId) ?? 'Pharnos'
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${senderDisplayName(rawOrg)} <${fromAddress}>`,
        to: [plan.contactEmail],
        subject: headerLine(monitorSubject(plan)),
        html: monitorHtml(plan, escapeHtml(rawOrg)),
      }),
    })
    if (!res.ok) {
      const detail = redactEmails((await res.text().catch(() => '')).slice(0, 200))
      logJson({ ...log, op: 'monitoring', status: 'email_failed', code: res.status, detail })
      continue
    }
    // Envoi réussi → journalise (idempotence DURE via unique(document_id, expiry_date)) + brûle le quota.
    const { error: insErr } = await supabase.from('monitoring_reminders').upsert(
      {
        org_id: plan.orgId,
        document_id: plan.documentId,
        expiry_date: plan.expiryDate,
        doc_type: plan.docType,
        contact_email: plan.contactEmail,
      },
      { onConflict: 'document_id,expiry_date', ignoreDuplicates: true },
    )
    if (insErr) logJson({ ...log, op: 'monitoring', status: 'log_failed', err: insErr.message.slice(0, 120) })
    sent++
    orgSent.set(plan.orgId, already + 1)
    void rateHit(supabase, `monrem:${plan.orgId}`, MONITOR_ORG_WINDOW_S)
  }
  return sent
}
