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

const PAGE_SIZE = 1000
const ID_CHUNK = 100
const INSERT_CHUNK = 200
// Caps e-mail : best-effort, jamais bloquants pour la journalisation.
const MAIL_MAX_PER_RUN = 50
const MAIL_ORG_WINDOW_S = 86_400
const MAIL_ORG_MAX_PER_DAY = 10
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
          'org_id, roadmap_auto_enabled, roadmap_agent_days, roadmap_agency_days, roadmap_email_enabled',
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
              'id, dossier_id, status, created_at, updated_at, decided_at, revoked_at, deleted_at, sender_email, recipient_email',
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

    const out = { scanned, planned: plans.length, inserted, emailed, dryRun }
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

/** T2 — accusé à l'ÉMETTEUR (FR, concis). */
function ackHtml(safeProduct: string, country: { fr: string; en: string }, plan: ReminderPlan): string {
  return (
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#444">` +
    `<p style="margin:0 0 12px">Bonjour,</p>` +
    `<p style="margin:0 0 12px">Votre relance pour le dossier <strong>${safeProduct}</strong> (${escapeHtml(country.fr)}) a été transmise à votre correspondant.</p>` +
    `<p style="margin:0 0 12px;color:#888;font-size:13px">En attente depuis ${plan.waitingDays} j (seuil : ${plan.thresholdDays} j). Toute réponse de votre correspondant vous parviendra directement (Répondre à).</p>` +
    `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — OS des affaires réglementaires UEMOA/CEDEAO</p>` +
    `</div>`
  )
}

/** Dégradation — pense-bête historique au labo (bilingue + lien Roadmap) quand le destinataire est inconnu. */
function selfReminderHtml(
  safeProduct: string,
  country: { fr: string; en: string },
  plan: ReminderPlan,
  roadmapUrl: string,
): string {
  return [
    `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">`,
    `<h2 style="margin:0 0 8px">Relance automatique · Automatic reminder</h2>`,
    `<p style="margin:0 0 4px;color:#444">Le dossier <strong>${safeProduct}</strong> (${escapeHtml(country.fr)}) est en attente de <strong>${partyLabel(plan.waitingOn, 'fr')}</strong> depuis <strong>${plan.waitingDays} jours</strong> (seuil : ${plan.thresholdDays} j).</p>`,
    `<p style="margin:0 0 16px;color:#888;font-size:13px">The dossier <strong>${safeProduct}</strong> (${escapeHtml(country.en)}) has been waiting on <strong>${partyLabel(plan.waitingOn, 'en')}</strong> for <strong>${plan.waitingDays} days</strong> (threshold: ${plan.thresholdDays} d).</p>`,
    `<p style="margin:0 0 16px;color:#444">Aucun e-mail de destinataire enregistré : pensez à relancer votre correspondant, ou renseignez son adresse dans « Relances ». · No recipient email on file — follow up manually or add the address under “Reminders”.</p>`,
    `<p style="margin:0 0 24px"><a href="${roadmapUrl}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ouvrir le parcours du dossier · Open the dossier roadmap</a></p>`,
    `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — OS des affaires réglementaires pharmaceutiques UEMOA/CEDEAO · the OS for pharmaceutical regulatory affairs in UEMOA/ECOWAS</p>`,
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
      const lang = officialLang(dossier.country)
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
          subject: headerLine(`Relance envoyée — ${dossier.product_name}`),
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
          `Relance — dossier ${dossier.product_name} (${country.fr}) : ${plan.waitingDays} j sans activité`,
        ),
        html: selfReminderHtml(safeProduct, country, plan, roadmapUrl),
      })
    }
  }
  return sent
}
