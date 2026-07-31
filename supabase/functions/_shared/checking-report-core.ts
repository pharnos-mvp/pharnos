// Cœur testable de l'Edge Function `checking-report` : validation du payload public, calcul du
// résultat par le barème du SERVEUR, et rendu de l'e-mail bilingue. Aucun accès réseau ni base —
// `index.ts` orchestre (CORS, rate-limit, insert, Resend), tout le raisonnement vit ici.
//
// Le barème vient de `_shared/checking/`, COPIE GÉNÉRÉE de `landing/checking/` par
// `npm run build:checking-bareme` (garde zéro-diff en CI). La source unique reste le dossier
// `landing/` ; la copie existe pour que le bundle déployé n'ait aucun import remontant au-dessus
// de `supabase/` — un import hors racine type-checke en local sans garantie d'entrer dans l'eszip.
import { AXES, GATES, ITEMS_ENR, ITEMS_REN, PAYS } from './checking/referentiel.js'
import { allowedAnswers, buildFlow, computeResult, OPERATIONS, PRODUCT_TYPES } from './checking/scoring.js'

export type Lang = 'fr' | 'en'
export type Channel = 'email' | 'whatsapp'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Numéro international tel qu'un MAH le saisit : indicatif, espaces, tirets, parenthèses.
// La forme ne suffit pas — « ()()() » la satisfait : on exige aussi une densité de chiffres.
export const PHONE_RE = /^\+?[0-9 ().\-]{6,24}$/
const PHONE_MIN_DIGITS = 8
const PHONE_MAX_DIGITS = 15

export interface ValidRequest {
  lang: Lang
  channel: Channel
  contact: string
  country: string
  operation: string
  productType: string
  answers: Record<string, string>
  newsletter: boolean
  /** Consentement à l'envoi, VÉRIFIÉ ici : la case cochée dans le navigateur n'est pas une preuve.
   *  Toujours `true` quand la requête est acceptée — la valeur est écrite en base avec sa date. */
  consent: true
}

export const escapeHtml = (s: string): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

/** Résout un libellé bilingue `["fr","en"]` (ou une chaîne unique) dans la langue demandée. */
export const pickLang = (v: unknown, lang: Lang): string =>
  Array.isArray(v) ? String(v[lang === 'en' ? 1 : 0] ?? v[0]) : String(v)

/**
 * Ne garde du corps que les réponses reconnues, valeur par valeur POUR CHAQUE ITEM.
 *
 * L'énumération globale ne suffit pas : `na` sort un item du dénominateur du score, donc
 * l'accepter sur un item qui ne le propose pas permettrait de forger un « 100/100 · prêt pour le
 * dépôt » en répondant `na` partout sauf aux trois verrous. Le jeu d'options du référentiel fait
 * foi — le même que celui affiché au prospect.
 */
export function sanitizeAnswers(raw: unknown, op: string, type: string): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const allowed = new Map<string, Set<string>>(
    buildFlow({ op, type }).map((it) => [it.id, allowedAnswers(it)]),
  )
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && allowed.get(k)?.has(v)) out[k] = v
  }
  return out
}

/**
 * Valide le payload public. Toute valeur inconnue est REJETÉE, jamais coercée vers un défaut :
 * un pays inventé doit produire une 400, pas un rapport au nom d'une autre autorité.
 * @returns la requête validée, ou `null` si elle doit être refusée (400).
 */
export function validateRequest(body: Record<string, unknown>): ValidRequest | null {
  const lang: Lang = body.lang === 'en' ? 'en' : 'fr'
  const channel: Channel | null =
    body.channel === 'whatsapp' ? 'whatsapp' : body.channel === 'email' ? 'email' : null
  const contact = typeof body.contact === 'string' ? body.contact.trim().slice(0, 254) : ''
  const country = typeof body.pays === 'string' ? body.pays : ''
  const operation = typeof body.op === 'string' ? body.op : ''
  const productType = typeof body.type === 'string' ? body.type : ''

  if (!channel) return null
  // Le consentement conditionne l'envoi ET la conservation : sans preuve serveur, on refuse.
  if (body.consent !== true) return null

  const digits = contact.replace(/\D/g, '').length
  const contactOk =
    channel === 'email'
      ? EMAIL_RE.test(contact)
      : PHONE_RE.test(contact) && digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS
  if (
    !contactOk ||
    !PAYS.some((p: { k: string }) => p.k === country) ||
    !OPERATIONS.includes(operation) ||
    !PRODUCT_TYPES.includes(productType)
  ) {
    return null
  }

  const answers = sanitizeAnswers(body.answers, operation, productType)
  if (Object.keys(answers).length === 0) return null

  return {
    lang,
    channel,
    contact,
    country,
    operation,
    productType,
    answers,
    newsletter: body.newsletter === true,
    consent: true,
  }
}

// La lecture d'IP vit dans `_shared/net.ts` (elle sert aussi `checkout`, qui n'a pas à
// embarquer le référentiel du Checking Standard). Ré-exportée pour les appelants existants.
export { clientIp } from './net.ts'

/**
 * Clé de bucket pour le plafond par destinataire. Le contact est de la PII : il est haché avant
 * de servir de clé, pour qu'aucune adresse ni aucun numéro n'apparaisse dans la table de
 * rate-limit ni dans les logs.
 */
export async function contactBucketKey(contact: string): Promise<string> {
  const data = new TextEncoder().encode(contact.trim().toLowerCase())
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Applique le barème du serveur. Un score posté par le client n'est jamais lu. */
export function resultFor(req: ValidRequest): ReturnType<typeof computeResult> {
  return computeResult({ op: req.operation, type: req.productType, answers: req.answers })
}

const VERDICT_TXT: Record<string, [string, string]> = {
  gate_fail: ['Verrou de réception non satisfait', 'Reception gate not met'],
  ready: ['Dossier prêt pour le dépôt', 'Dossier ready for filing'],
  incomplete: ['Dossier incomplet — à sécuriser avant dépôt', 'Incomplete dossier — secure before filing'],
  not_ready: ['Dossier non prêt pour le dépôt', 'Dossier not ready for filing'],
}
/* Signalétique de l'e-mail — volontairement SOBRE.
   Un rapport réglementaire qui arrive en boîte de réception n'est pas un tableau de bord : les
   aplats saturés (rouge vif, vert vif) y lisent comme une alarme publicitaire et abîment la
   crédibilité du constat. On garde donc un fond neutre, un FILET vertical coloré pour porter le
   statut, et un texte sombre lisible. La couleur informe, elle ne crie pas. */
const VERDICT_FG: Record<string, string> = {
  gate_fail: '#8c2f2f',
  ready: '#1f6f5c',
  incomplete: '#8a6321',
  not_ready: '#8c2f2f',
}
const VERDICT_RULE: Record<string, string> = {
  gate_fail: '#b45454',
  ready: '#4f9b86',
  incomplete: '#c2933f',
  not_ready: '#b45454',
}
const NEUTRAL_BG = '#f7f8fa'
const NEUTRAL_BORDER = '#e3e6ec'

/** Recommandation d'un manquant, dans le ton exact de la page (« À prévoir : … »). */
export function fixLine(item: Record<string, unknown>, kind: string, lang: Lang): string {
  if (item.fixMap) return pickLang((item.fixMap as Record<string, unknown>)[kind], lang)
  const piece = pickLang(item.piece, lang)
  if (kind === 'ko') return (lang === 'en' ? 'To prepare: ' : 'À prévoir : ') + piece + '.'
  const note = item.ncNote
    ? lang === 'en'
      ? ` — gap noted: “${pickLang(item.ncNote, lang)}”`
      : ` — écart relevé : « ${pickLang(item.ncNote, lang)} »`
    : ''
  return (lang === 'en' ? 'To rework: ' : 'À reprendre : ') + piece + note + '.'
}

/**
 * Rapport HTML envoyé au prospect. Tout ce qui vient de la requête passe par `escapeHtml` :
 * le nom du pays vient du référentiel, mais la règle vaut pour la ligne entière du template.
 */
export function buildReportEmail(
  req: ValidRequest,
  r: ReturnType<typeof computeResult>,
): { subject: string; html: string } {
  const { lang, country, operation } = req
  const en = lang === 'en'
  const pays = PAYS.find((p: { k: string }) => p.k === country) ?? PAYS[0]
  // Un objet d'e-mail n'est PAS du HTML : l'échapper y afficherait « Côte d&#39;Ivoire ».
  // On garde donc les deux formes — brute pour le sujet, échappée pour le corps.
  const countryRaw = pickLang(pays.nom, lang)
  const opRaw = operation === 'ren' ? (en ? 'Renewal' : 'Renouvellement') : en ? 'Registration' : 'Enregistrement'
  const agency = escapeHtml(pickLang(pays.ag, lang))
  const countryName = escapeHtml(countryRaw)
  const opTxt = escapeHtml(opRaw)
  const byId = new Map(
    (operation === 'ren' ? ITEMS_REN : ITEMS_ENR).map((it: { id: string }) => [it.id, it]),
  )

  const plan = r.missing
    .map((m, i) => {
      const it = byId.get(m.id)
      if (!it) return ''
      return `<tr><td style="padding:6px 10px 6px 0;vertical-align:top;color:#6b7280">${i + 1}.</td><td style="padding:6px 0">${escapeHtml(fixLine(it, m.kind, lang))}</td></tr>`
    })
    .join('')

  // Puces de verrous : fond neutre uniforme, seul le glyphe ✓/✗ porte la teinte — l'œil repère
  // l'état sans qu'une rangée de pastilles rouges ne domine le rapport.
  const gates = r.gates
    .map(
      (g) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 11px;border-radius:99px;font-size:12px;background:${NEUTRAL_BG};border:1px solid ${NEUTRAL_BORDER};color:#3f4657"><span style="color:${g.ok ? VERDICT_FG.ready : VERDICT_FG.gate_fail};font-weight:700">${g.ok ? '✓' : '✗'}</span> ${escapeHtml(pickLang(GATES[g.key as keyof typeof GATES], lang))}</span>`,
    )
    .join('')

  const axes = r.axes
    .map(
      (a) =>
        `<tr><td style="padding:3px 12px 3px 0;color:#4b5563">${escapeHtml(pickLang(AXES[a.key as keyof typeof AXES], lang))}</td><td style="padding:3px 0;font-weight:700">${a.pct} %</td></tr>`,
    )
    .join('')

  const scope = en
    ? `The Checking Standard measures the completeness of your dossier against published requirements — Regulation No. 04/2020/CM/UEMOA and the national requirements of ${agency}. It covers what you declare and does not prejudge the actual content of your documents. It is neither an opinion nor a decision of the competent authority: admissibility rests solely with ${agency}.`
    : `Le Checking Standard mesure la complétude de votre dossier au regard des exigences publiées — Règlement n° 04/2020/CM/UEMOA et exigences nationales de ${agency}. Il porte sur ce que vous déclarez et ne préjuge pas du contenu réel des pièces. Il ne constitue ni un avis ni une décision de l'autorité compétente : la recevabilité relève exclusivement de ${agency}.`

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
  <div style="background:#0a1628;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#e3b341">Checking Standard · Pharnos</div>
    <h1 style="margin:8px 0 0;font-size:20px;font-weight:700">${en ? 'Your completeness diagnostic' : 'Votre diagnostic de complétude'}</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#c3d0e6">${opTxt} · ${countryName} · ${en ? 'reception standard of' : 'norme de réception de'} ${agency}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <div style="text-align:center;padding:6px 0 14px">
      <div style="font-size:44px;font-weight:800;color:#0a1628;line-height:1">${r.score}<span style="font-size:18px;color:#9ca3af"> / 100</span></div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">${en ? 'declared completeness against the WAEMU reception standard' : 'complétude déclarée au regard de la norme de réception UEMOA'}</div>
      <div style="margin:14px auto 0;max-width:420px;padding:11px 16px;text-align:left;background:${NEUTRAL_BG};border:1px solid ${NEUTRAL_BORDER};border-left:3px solid ${VERDICT_RULE[r.verdict]};border-radius:6px;font-weight:700;font-size:15px;color:${VERDICT_FG[r.verdict]}">${escapeHtml(pickLang(VERDICT_TXT[r.verdict], lang))}</div>
    </div>

    <h2 style="font-size:14px;margin:20px 0 8px;color:#0a1628">${en ? 'Reception gates' : 'Verrous de réception'} — ${r.gateOk}/${r.gateTotal}</h2>
    <div>${gates}</div>
    <p style="font-size:12.5px;color:#6b7280;margin:8px 0 0">${en ? 'Annex IV of Regulation 04/2020 makes an unmet gate a ground for refusal of reception, whatever the score.' : "L'Annexe IV du Règlement 04/2020 fait d'un verrou non satisfait un motif de refus de réception, quel que soit le score."}</p>

    ${
      axes
        ? `<h2 style="font-size:14px;margin:22px 0 8px;color:#0a1628">${en ? 'By area' : 'Par axe'}</h2>
    <table style="font-size:13.5px;border-collapse:collapse">${axes}</table>`
        : ''
    }

    ${
      plan
        ? `<h2 style="font-size:14px;margin:22px 0 8px;color:#0a1628">${en ? 'Your preparation plan, in priority order' : 'Votre plan de préparation, par ordre de priorité'}</h2>
    <table style="font-size:13.5px;border-collapse:collapse;width:100%">${plan}</table>`
        : `<p style="font-size:13.5px;margin:22px 0 0;color:${VERDICT_FG.ready}">${en ? 'Nothing is missing from your declaration. What remains is the actual content of each document.' : 'Rien ne manque à votre déclaration. Reste le contenu réel des pièces.'}</p>`
    }

    <div style="margin-top:24px;padding:16px;background:#0a1628;border-radius:10px;color:#e9eef7">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#e3b341">${en ? 'Next step' : 'Étape suivante'}</div>
      <p style="margin:6px 0 12px;font-size:13.5px;color:#c3d0e6">${en ? 'The diagnostic tells you what is missing. The Pharnos CTD Builder builds it: WAEMU Module 1 tree, official templates, completeness checks before filing.' : "Le diagnostic vous dit ce qui manque. Le CTD Builder Pharnos le construit : arborescence Module 1 UEMOA, modèles officiels, contrôle de complétude avant dépôt."}</p>
      <a href="https://app.pharnos.com" style="display:inline-block;background:linear-gradient(92deg,#d29922,#e3b341);color:#20160a;font-weight:700;font-size:13.5px;padding:10px 20px;border-radius:99px;text-decoration:none">${en ? 'Try free for 30 days →' : 'Essayer 30 jours gratuitement →'}</a>
    </div>

    <p style="margin:22px 0 0;font-size:11.5px;color:#6b7280;line-height:1.55">
      <b>${en ? 'Scope of this diagnostic.' : 'Portée du diagnostic.'}</b> ${scope}
      <br /><span style="color:#9ca3af">${en ? 'Scale version' : 'Version du barème'} : ${escapeHtml(r.version)}</span>
    </p>
  </div>
</div>`

  return { subject: `Checking Standard — ${r.score}/100 · ${opRaw} · ${countryRaw}`, html }
}

/** Notification interne pour le canal WhatsApp : aucune API WhatsApp n'est branchée à ce stade,
 *  l'équipe recontacte le prospect. Le numéro est de la PII — il ne sort pas vers un tiers. */
export function buildTeamNotice(
  req: ValidRequest,
  r: ReturnType<typeof computeResult>,
): { subject: string; html: string } {
  return {
    subject: `Checking Standard — demande WhatsApp · ${r.score}/100 · ${req.country}`,
    html:
      `<p>Nouveau lead Checking Standard à recontacter sur WhatsApp.</p>` +
      `<p><b>Numéro :</b> ${escapeHtml(req.contact)}<br />` +
      `<b>Score :</b> ${r.score}/100 · <b>Verdict :</b> ${escapeHtml(r.verdict)} · ` +
      `<b>Verrous :</b> ${r.gateOk}/${r.gateTotal}<br />` +
      `<b>Contexte :</b> ${escapeHtml(req.operation)} · ${escapeHtml(req.productType)} · ` +
      `${escapeHtml(req.country)} · ${escapeHtml(req.lang)}</p>`,
  }
}
