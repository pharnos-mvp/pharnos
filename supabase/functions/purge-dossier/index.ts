// Edge Function `purge-dossier` (LOT 9, recette CEO) — purge IMMÉDIATE d'un brouillon de la
// corbeille (« Supprimer définitivement », clin d'œil corbeille Windows), sans attendre la purge
// automatique à 30 j. Même mécanique que le cron (`_shared/retention-purge-core.ts`), mais :
//   • appelée par un UTILISATEUR (verify_jwt par défaut + getUser) — l'audit est ATTRIBUABLE
//     (ALCOA : actor = l'utilisateur, motif optionnel tracé) ;
//   • autorisation vérifiée en service-role : membre de l'org ET non scopé (CS1 : la couche
//     suivi ne gère pas la fin de vie), dossier DE CETTE org, EN corbeille, non archivé,
//     et GARDE GxP : aucune correspondance (même soft-supprimée) — un dossier soumis un jour
//     n'est jamais purgé, quel que soit le chemin.
// Idempotent : un dossier déjà purgé répond ok (`already: true`) — un double-clic ne casse rien.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, userHash } from '../_shared/log.ts'
import { purgeDossier } from '../_shared/retention-purge-core.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REASON_MAX = 300
// Rate-limit par UTILISATEUR (compteur de fenêtre partagé `share_hit`, 0017) : endpoint
// destructif service-role → jamais sans throttle (revue). 10 purges/min couvre tout usage réel
// (vider une corbeille à la main) ; un script en boucle mange le plafond, pas le Storage.
const RATE_MAX_PER_WINDOW = 10
const RATE_WINDOW_S = 60

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'purge-dossier', reqId, op: 'cors', status: 'forbidden' })
    return new Response('origine non autorisée', { status: 403 })
  }
  const cors = corsHeaders(origin)
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', 'x-request-id': reqId },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Authentification : JWT de l'appelant (client anon + header) — pattern Edge `team`.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)
  const log = { fn: 'purge-dossier', reqId, user: await userHash(user.id) }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const b = (raw ?? {}) as { orgId?: unknown; dossierId?: unknown; reason?: unknown }
  const orgId = String(b.orgId ?? '')
  const dossierId = String(b.dossierId ?? '')
  const reason = String(b.reason ?? '')
    .trim()
    .slice(0, REASON_MAX)
  if (!UUID_RE.test(orgId) || !UUID_RE.test(dossierId)) return json({ error: 'bad_request' }, 400)

  // Autorisations + gardes en SERVICE-ROLE (la purge elle-même contourne la RLS : chaque
  // condition est donc re-vérifiée ici, jamais déléguée à l'UI).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  // Throttle AVANT tout travail (compteur illisible = fail-closed, pattern share/lifecycle).
  const { data: hits, error: rateErr } = await admin.rpc('share_hit', {
    p_bucket: `purge:${user.id}`,
    p_window_seconds: RATE_WINDOW_S,
  })
  if (rateErr || typeof hits !== 'number') {
    logJson({ ...log, op: 'rate', status: 'error' })
    return json({ error: 'unavailable' }, 503)
  }
  if (hits > RATE_MAX_PER_WINDOW) {
    logJson({ ...log, status: 'too_many' })
    return json({ error: 'too_many' }, 429)
  }

  try {
    // 1) Membre de l'org…
    const { data: member, error: memberErr } = await admin
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (memberErr) throw memberErr
    if (!member) {
      logJson({ ...log, status: 'forbidden_not_member' })
      return json({ error: 'forbidden' }, 403)
    }
    // …et NON scopé (CS1 : le membre à périmètre = couche suivi, pas de fin de vie).
    const { data: scoped, error: scopedErr } = await admin
      .from('membership_scopes')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (scopedErr) throw scopedErr
    if (scoped) {
      logJson({ ...log, status: 'forbidden_scoped' })
      return json({ error: 'forbidden' }, 403)
    }

    // 2) Le dossier : de cette org, EN corbeille, non archivé.
    const { data: dossier, error: dosErr } = await admin
      .from('dossiers')
      .select('id, org_id, product_name, deleted_at, purged_at, archived_at')
      .eq('id', dossierId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (dosErr) throw dosErr
    if (!dossier) return json({ error: 'not_found' }, 404)
    if (dossier.purged_at) {
      // Déjà purgé (double-clic / rejeu) : idempotent, rien à refaire.
      logJson({ ...log, status: 'already_purged' })
      return json({ purged: true, already: true, filesRemoved: 0 })
    }
    if (!dossier.deleted_at) return json({ error: 'not_in_trash' }, 409)
    if (dossier.archived_at) return json({ error: 'archived' }, 403)

    // 3) Garde GxP : toute correspondance (même soft-supprimée) = soumis un jour → jamais purgé.
    const { data: corr, error: corrErr } = await admin
      .from('correspondences')
      .select('id')
      .eq('dossier_id', dossierId)
      .limit(1)
    if (corrErr) throw corrErr
    if ((corr ?? []).length > 0) {
      logJson({ ...log, status: 'forbidden_submitted' })
      return json({ error: 'submitted' }, 403)
    }

    // 4) Purge (fichiers + enfants + squelette tombstone + audit ATTRIBUÉ à l'utilisateur).
    const label = `${dossier.product_name} · suppression définitive (corbeille)${
      reason ? ` · motif : ${reason}` : ''
    }`
    const filesRemoved = await purgeDossier(
      admin,
      { id: dossier.id, org_id: dossier.org_id, product_name: dossier.product_name },
      { actorId: user.id, actorEmail: user.email ?? '', label },
    )

    logJson({ ...log, status: 'ok', filesRemoved })
    return json({ purged: true, filesRemoved })
  } catch (e) {
    logJson({
      ...log,
      status: 'error',
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'server_error' }, 500)
  }
})
