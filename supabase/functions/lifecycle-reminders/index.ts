// Edge Function `lifecycle-reminders` (LOT 10) — relances AUTOMATIQUES du cycle de vie.
// Déclenchée chaque nuit par pg_cron → pg_net (migration 0050), JAMAIS par un navigateur.
//
// Contrat sécurité :
//   • verify_jwt = false (config.toml) : l'appelant n'est pas un utilisateur. La barrière est le
//     secret partagé `x-cron-secret` (256 bits, généré au déploiement : Vault côté cron, secret
//     d'environnement LIFECYCLE_CRON_SECRET côté fonction). Comparaison par hachage (timing-safe
//     par construction). Secret absent de l'env → 503 fail-closed.
//   • Écritures en service-role : INSERT `lifecycle_events` actor_id='system' — le journal reste
//     append-only pour l'API authentifiée (aucune policy nouvelle), le système écrit par le même
//     canal que l'Edge `share`.
//   • L'e-mail de relance ne contient JAMAIS de lien tokenisé (le token n'est pas stocké côté
//     serveur — ADR-0003) : il notifie le CÔTÉ LABO (expéditeur de la correspondance) avec un
//     lien vers la Roadmap de l'app. Relancer l'agent avec le lien reste un acte humain (M5).
//   • Auto-idempotent : l'événement relance REPART le compteur d'attente → un rejeu du cron le
//     même jour ne double-tire pas (waiting_days retombe sous le seuil).
//
// Perf/échelle : scan paginé des dossiers + requêtes par lots (jamais de N+1). Au MVP (dizaines
// de dossiers) le run est < 1 s ; à 100×, le goulot = le scan complet nocturne → pré-filtrer en
// SQL (dossiers avec activité < seuil min) avant de charger les lots. Noté, pas construit.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { sha256Hex } from '../_shared/share-auth.ts'
import {
  COUNTRY_NAMES,
  planReminder,
  type ReminderCorrRow,
  type ReminderDecisionMsgRow,
  type ReminderDossierRow,
  type ReminderEventRow,
  type ReminderPlan,
} from '../_shared/lifecycle-reminders-core.ts'

const PAGE_SIZE = 1000
const ID_CHUNK = 100
const INSERT_CHUNK = 200
// Caps e-mail : best-effort, jamais bloquants pour la journalisation.
const MAIL_MAX_PER_RUN = 50
const MAIL_ORG_WINDOW_S = 86_400
const MAIL_ORG_MAX_PER_DAY = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  // Barrière d'accès : secret partagé cron (fail-closed si non configuré).
  const secret = Deno.env.get('LIFECYCLE_CRON_SECRET') ?? ''
  if (!secret) {
    logJson({ ...log, status: 'config_missing' })
    return json({ error: 'unavailable' }, 503)
  }
  const given = req.headers.get('x-cron-secret') ?? ''
  if (!given || (await sha256Hex(given)) !== (await sha256Hex(secret))) {
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  try {
    const now = new Date()
    const plans: ReminderPlan[] = []
    const products = new Map<string, ReminderDossierRow>()
    let scanned = 0

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
              'id, dossier_id, status, created_at, updated_at, decided_at, revoked_at, deleted_at, sender_email',
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
        const plan = planReminder({ dossier, correspondences: corrs, events, decisionMessages, now })
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
    let emailed = 0
    if (!dryRun) emailed = await sendEmails(supabase, plans, products, log)

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
 * Notifie le côté labo (expéditeur de la dernière correspondance active) qu'une relance a été
 * journalisée — bilingue FR/EN (langue du destinataire inconnue côté serveur, pattern `share`).
 * Sans lien tokenisé (jamais reconstructible) : CTA vers la Roadmap de l'app.
 */
async function sendEmails(
  supabase: SupabaseClient,
  plans: ReminderPlan[],
  products: Map<string, ReminderDossierRow>,
  log: Record<string, unknown>,
): Promise<number> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    if (plans.length > 0) logJson({ ...log, op: 'email', status: 'email_unavailable' })
    return 0
  }
  const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://app.pharnos.com').replace(/\/+$/, '')

  let sent = 0
  for (const plan of plans) {
    if (sent >= MAIL_MAX_PER_RUN) {
      logJson({ ...log, op: 'email', status: 'run_cap_reached', skipped: plans.length - sent })
      break
    }
    const dossier = products.get(plan.dossierId)
    if (!dossier || !plan.senderEmail || !EMAIL_RE.test(plan.senderEmail)) continue

    // Plafond par org/jour (fenêtre fixe partagée `share_hit`) — fail-closed sur erreur technique.
    const hits = await rateHit(supabase, `autorem:${plan.orgId}`, MAIL_ORG_WINDOW_S)
    if (hits === null || hits > MAIL_ORG_MAX_PER_DAY) continue

    const country = COUNTRY_NAMES[dossier.country] ?? { fr: dossier.country, en: dossier.country }
    const party =
      plan.waitingOn === 'agent'
        ? { fr: 'l’agent local', en: 'the local agent' }
        : { fr: 'l’agence nationale', en: 'the national agency' }
    const safeProduct = escapeHtml(dossier.product_name)
    const roadmapUrl = `${appUrl}/workspace/${encodeURIComponent(plan.dossierId)}/roadmap`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [plan.senderEmail],
        subject:
          `Relance — dossier ${dossier.product_name.replace(/[\r\n]/g, ' ')} (${country.fr}) : ` +
          `${plan.waitingDays} j sans activité`,
        html: [
          `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px">`,
          `<h2 style="margin:0 0 8px">Relance automatique · Automatic reminder</h2>`,
          `<p style="margin:0 0 4px;color:#444">Le dossier <strong>${safeProduct}</strong> (${escapeHtml(country.fr)}) est en attente de <strong>${party.fr}</strong> depuis <strong>${plan.waitingDays} jours</strong> (seuil : ${plan.thresholdDays} j).</p>`,
          `<p style="margin:0 0 16px;color:#888;font-size:13px">The dossier <strong>${safeProduct}</strong> (${escapeHtml(country.en)}) has been waiting on <strong>${party.en}</strong> for <strong>${plan.waitingDays} days</strong> (threshold: ${plan.thresholdDays} d).</p>`,
          `<p style="margin:0 0 16px;color:#444">La relance a été consignée dans le journal du dossier. Pensez à relancer votre correspondant. · The reminder was logged in the dossier journal — consider following up with your correspondent.</p>`,
          `<p style="margin:0 0 24px"><a href="${roadmapUrl}" style="background:#18181b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ouvrir le parcours du dossier · Open the dossier roadmap</a></p>`,
          `<p style="margin:16px 0 0;color:#aaa;font-size:11px">Pharnos — OS des affaires réglementaires pharmaceutiques UEMOA/CEDEAO · the OS for pharmaceutical regulatory affairs in UEMOA/ECOWAS</p>`,
          `</div>`,
        ].join(''),
      }),
    })
    if (res.ok) {
      sent++
    } else {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      logJson({ ...log, op: 'email', status: 'email_failed', detail })
    }
  }
  return sent
}
