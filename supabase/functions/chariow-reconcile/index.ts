// Edge Function `chariow-reconcile` — la réconciliation ACTIVE des ventes (LOT C1).
//
// La chaîne d'encaissement n'est plus JAMAIS suspendue au webhook d'un tiers : toutes les deux
// minutes, un cron balaie les ventes réglées chez Chariow et fait naître ce que le Pulse a manqué
// — l'automatisation exacte du geste manuel de la première vente réelle (2026-08-14, Pulse jamais
// livré, webhook déclenché à la main).
//
// Contrat de sécurité :
//   • `verify_jwt = false`, AUCUN en-tête CORS — c'est une surface cron, pas navigateur.
//   • Auth par `x-cron-secret`, comparé via le hash Vault (`chariow_reconcile_secret_hash`) —
//     le secret ne sort jamais de la base (même patron que `job-tick`).
//   • La naissance passe par le chemin RE-VÉRIFIÉ : `GET /v1/sales/{id}` → `lireVente` →
//     `faireNaitreCommande` — le MÊME module que le webhook.
//   • Chaque naissance par ce chemin est un SIGNAL : le webhook a manqué une vente. Elle se
//     journalise ET s'alerte au support — c'est une panne du rail, pas un état normal.
//
// Trois filets qui ne se voient qu'en revue :
//   • une vente DÉFINITIVEMENT non-naissable (écartée par `lireVente`) entre dans la table de
//     skips — sans quoi elle serait re-téléchargée toutes les 2 minutes et occuperait un créneau
//     du cap pour toujours, jusqu'à AFFAMER le balayage entier en silence ;
//   • une commande née SANS son e-mail n°1 (`notified_at` nul — Resend en panne à la naissance)
//     est re-servie ici : Chariow a reçu son 200, il ne reviendra pas, et l'acheteur n'a AUCUN
//     lien. `faireNaitreCommande` re-frappe un jeton et re-tente l'envoi ;
//   • une liste PLEINE est dite et alertée : le magasin vend aussi les packs CTD Builder, et une
//     page tronquée rendrait des ventes upgrade invisibles au balayage sans aucun symptôme.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { logJson, newReqId } from '../_shared/log.ts'
import { faireNaitreCommande } from '../_shared/order-birth.ts'
import { lireVente } from '../_shared/orders-core.ts'
import { egalConstant } from '../_shared/pulse-signature.ts'
import { lireListeVentes, ventesAReconcilier } from '../_shared/reconcile-core.ts'

const CHARIOW_SALES = 'https://api.chariow.com/v1/sales'
const CHARIOW_TIMEOUT_MS = 15_000
/** Fenêtre balayée : 2 jours. Un Pulse rejoue jusqu'à ~24 h ; au-delà de 48 h, le support a déjà vu. */
const FENETRE_JOURS = 2
/** Lignes demandées à la liste — large : la fenêtre de 2 jours tient dedans très largement. */
const PAR_PAGE = 50
/** Naissances par TOUR. Un retard se résorbe en quelques tours ; un tour ne s'emballe jamais. */
const CAP_PAR_TOUR = 5
/** Durée d'un skip : au-delà de la fenêtre balayée — un verdict définitif ne se rachète pas. */
const SKIP_HEURES = 72

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const sha256Hex = async (s: string): Promise<string> => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Appel Chariow borné, corps COMPRIS — la clé API ne part que vers `api.chariow.com`.
 *
 * ⚠️ Le minuteur couvre `res.json()`, pas seulement les en-têtes : un `return fetch(...)` dont le
 * `finally` désarme le signal laisse la LECTURE du corps sans garde — un corps qui n'arrive
 * jamais aurait pendu le tour entier jusqu'au timeout du cron (trouvé en revue de diff).
 */
async function chariowJson(
  url: string,
  apiKey: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CHARIOW_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: ctrl.signal,
    })
    return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Alerte support — best effort, BORNÉE, jamais bloquante. Une vente née par réconciliation
 * signifie que le Pulse a manqué : le support doit le SAVOIR, pas le découvrir au prochain
 * incident.
 */
async function alerterSupport(sujet: string, corps: string): Promise<void> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const support = Deno.env.get('SUPPORT_EMAIL')
    if (!apiKey || !support) return
    const from = Deno.env.get('EMAIL_FROM') ?? 'Pharnos <onboarding@resend.dev>'
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [support], subject: sujet, text: corps }),
      // Même borne que l'e-mail n°2 de `job-tick` : une alerte pendue brûlerait le tour entier.
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // L'alerte est un confort ; la commande, elle, est née.
  }
}

Deno.serve(async (req) => {
  const log = { fn: 'chariow-reconcile', reqId: newReqId() }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Contrôle BON MARCHÉ d'abord — même patron que `job-tick` : 64 hexa, toujours.
  const presente = req.headers.get('x-cron-secret') ?? ''
  if (presente.length !== 64) return json({ error: 'forbidden' }, 403)

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data: attendu, error: hashErr } = await sb.rpc('chariow_reconcile_secret_hash')
  // Secret absent ⇒ porte FERMÉE, et le même 403 que l'échec de comparaison.
  if (hashErr || typeof attendu !== 'string' || attendu.length !== 64) {
    logJson({ ...log, status: 'secret_absent' })
    return json({ error: 'forbidden' }, 403)
  }
  if (!egalConstant(await sha256Hex(presente), attendu)) {
    logJson({ ...log, status: 'auth_refusee' })
    return json({ error: 'forbidden' }, 403)
  }

  const apiKey = Deno.env.get('CHARIOW_API_KEY')
  if (!apiKey) {
    logJson({ ...log, status: 'no_api_key' })
    return json({ error: 'not_configured' }, 503)
  }

  // ── La liste des ventes réglées de la fenêtre ─────────────────────────────────────────────────
  const fenetreDebut = new Date(Date.now() - FENETRE_JOURS * 24 * 3600 * 1000)
  const depuis = fenetreDebut.toISOString().slice(0, 10)
  let liste: ReturnType<typeof lireListeVentes>
  try {
    const res = await chariowJson(
      `${CHARIOW_SALES}?status=completed&per_page=${PAR_PAGE}&start_date=${depuis}`,
      apiKey,
    )
    if (!res.ok) {
      logJson({ ...log, status: 'chariow_http', http: res.status })
      return json({ error: 'upstream' }, 503)
    }
    liste = lireListeVentes(res.body)
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    logJson({ ...log, status: aborted ? 'chariow_timeout' : 'chariow_error' })
    return json({ error: 'upstream' }, 503)
  }

  // ⚠️ Une liste PLEINE cache peut-être des ventes : le même magasin vend les packs CTD Builder,
  // qui consomment les mêmes 50 lignes. L'invisibilité serait totale — on la DIT, fort.
  if (liste.length >= PAR_PAGE) {
    logJson({ ...log, status: 'liste_tronquee', ventes: liste.length })
    await alerterSupport(
      'Réconciliation Chariow : liste tronquée',
      `Le balayage a reçu ${liste.length} ventes (la page entière) sur ${FENETRE_JOURS} jours : ` +
        `des ventes peuvent être invisibles. La pagination doit être implémentée.`,
    )
  }

  // Les ventes déjà NÉES, et parmi elles les MUETTES (nées sans leur e-mail n°1) — une requête.
  let dejaNees = new Set<string>()
  let muettes: string[] = []
  if (liste.length > 0) {
    const { data: connues, error: dbErr } = await sb
      .from('orders')
      .select('chariow_sale_id, notified_at')
      .in('chariow_sale_id', liste.map((v) => v.id))
    if (dbErr) {
      logJson({ ...log, status: 'db_error' })
      return json({ error: 'db' }, 503)
    }
    dejaNees = new Set((connues ?? []).map((c) => c.chariow_sale_id as string))
    // ⚠️ Le filet du filet : une commande née pendant une panne Resend n'a NI e-mail NI rejeu —
    // Chariow a reçu son 200. `faireNaitreCommande` (chemin 23505 → `notified_at` nul) re-frappe
    // un jeton et re-tente l'envoi. Sans ce balayage, l'acheteur payé n'a aucun lien, pour
    // toujours, sans un log.
    muettes = (connues ?? [])
      .filter((c) => !c.notified_at)
      .map((c) => c.chariow_sale_id as string)
  }

  // Les ventes DÉFINITIVEMENT écartées (skips) ne se re-téléchargent pas toutes les 2 minutes.
  const { data: skipsData } = await sb
    .from('chariow_reconcile_skips')
    .select('sale_id')
    .gt('until', new Date().toISOString())
  const skips = new Set((skipsData ?? []).map((r) => r.sale_id as string))

  const candidates = ventesAReconcilier(
    liste,
    new Set([...dejaNees, ...skips]),
    CAP_PAR_TOUR,
  )
  // Les muettes passent par le MÊME chemin (re-vérification puis naissance-rejeu), dans le même
  // cap : re-servir un e-mail est moins urgent qu'une naissance, elles ferment la marche.
  const manquantes = [...candidates, ...muettes.filter((m) => !candidates.includes(m))]
    .slice(0, CAP_PAR_TOUR)

  // ── La naissance, par le MÊME chemin re-vérifié que le webhook ────────────────────────────────
  let reconciliees = 0
  let reveillees = 0
  for (const saleId of manquantes) {
    let vente: unknown
    try {
      const res = await chariowJson(`${CHARIOW_SALES}/${encodeURIComponent(saleId)}`, apiKey)
      if (!res.ok) {
        logJson({ ...log, status: 'verif_http', http: res.status, sale: saleId })
        continue
      }
      vente = res.body
    } catch {
      // Panne TRANSITOIRE : aucun skip — le prochain tour retente.
      logJson({ ...log, status: 'verif_error', sale: saleId })
      continue
    }
    const v = lireVente(vente)
    if ('erreur' in v) {
      // Verdict DÉFINITIF (produit hors périmètre malgré le tri, contact absent…) : il ne se
      // rachète pas toutes les deux minutes. Sans ce skip, la vente occupait un créneau du cap à
      // CHAQUE tour — cinq comme elle suffisaient à affamer le balayage entier, en silence.
      logJson({ ...log, status: 'vente_ecartee', raison: v.erreur, sale: saleId })
      await sb.from('chariow_reconcile_skips').upsert({
        sale_id: saleId,
        reason: v.erreur.slice(0, 200),
        until: new Date(Date.now() + SKIP_HEURES * 3600 * 1000).toISOString(),
      })
      continue
    }
    const naissance = await faireNaitreCommande(sb, v, log)
    if (naissance.statut !== 'nee') continue
    if (naissance.renaissance) {
      // Une commande muette réveillée : l'e-mail n°1 vient (enfin) de partir.
      reveillees++
      logJson({ ...log, status: 'muette_reveillee', sale: saleId, mail: naissance.mail })
      continue
    }
    reconciliees++
    // ⚠️ Le SIGNAL (C1) : une naissance ici veut dire que le Pulse a manqué. Journalisé ET
    // alerté — c'est une panne du rail Chariow, pas un état normal.
    logJson({
      ...log,
      status: 'reconciliee',
      sale: saleId,
      offre: v.offre,
      essai: v.essai,
      mail: naissance.mail,
    })
    await alerterSupport(
      `${v.essai ? '[RECETTE] ' : ''}Vente réconciliée sans Pulse — ${saleId}`,
      [
        `La vente ${saleId} a été réglée chez Chariow mais son Pulse n'est jamais arrivé.`,
        `La réconciliation active l'a fait naître (commande + e-mail n°1) — l'acheteur ne voit rien.`,
        `À surveiller : si cela se répète, le webhook Chariow est en panne durable.`,
      ].join('\n'),
    )
  }

  // Un tour à vide ne journalise rien : 720 « rien à faire » par jour noieraient le signal.
  if (liste.length > 0 || reconciliees > 0 || reveillees > 0) {
    logJson({
      ...log,
      status: 'ok',
      ventes: liste.length,
      manquantes: manquantes.length,
      reconciliees,
      reveillees,
    })
  }
  return json({ ok: true, reconciliees, reveillees }, 200)
})
