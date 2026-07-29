// Edge Function `upgrade` — mise en conformité d'un document au template officiel en vigueur
// (Regafy Upgrade, U4). Dernier recours, assistif : produit une VERSION restructurée selon le
// template, à relire — l'original n'est jamais modifié.
//
// ZÉRO HALLUCINATION (règle absolue) : chaque information du document produit provient du
// document source ; toute rubrique du template sans information correspondante reçoit EXACTEMENT
// le marqueur [NON FOURNI DANS LE DOCUMENT SOURCE]. Température 0.
//
// Contrat sécurité (ADR 0002) : JWT vérifié, CORS whitelist, bornes d'entrée, Storage via le
// JWT appelant (RLS), logs JSON sans PII, Vertex no-train.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { specForDocType, specPromptText } from '../_shared/conformity-specs.ts'
import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, userHash } from '../_shared/log.ts'
import { frenchCalibration } from '../_shared/pharma-glossary.ts'
import { activeOrgFromRequest, checkAiQuota, recordAiUsage } from '../_shared/quota.ts'
import { prepareSource } from '../_shared/ai/evidence.ts'
import { findRubric } from '../_shared/ai/section-schema.ts'
import { generateParts, streamSimpleSse, type Part } from '../_shared/ai/provider.ts'
import {
  generateSection,
  MISSING_MARKER,
  SECTION_BUDGET_MS,
} from '../_shared/upgrade-section-core.ts'
import { runWithUsage, withUsage, type Usage } from '../_shared/usage.ts'

const MAX_FILE_BYTES = 12 * 1024 * 1024
const MAX_TEXT_CHARS = 60_000
const STORAGE_BUCKET = 'documents'
// 120 s et non 180 : le mur de wall clock Edge est à 150 s (plan `free`). Un garde-fou au-delà
// ne se déclenche jamais — la plateforme tue le worker en 546 avant. Les 30 s de marge couvrent
// le téléchargement Storage (jusqu'à 12 Mo), l'encodage base64 et l'écriture de la réponse.
const UPGRADE_TIMEOUT_MS = 120_000
/** En deçà, le mode rubrique refuse de partir : un appel qui ne peut pas finir est un 546 déguisé. */
const MIN_SECTION_BUDGET_MS = 20_000

// Le marqueur vit désormais dans `_shared/upgrade-section-core.ts` (source unique côté Edge : le
// mode rubrique le REND, le mode document l'exige du modèle). Ré-exporté pour les appelants.
export { MISSING_MARKER }

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function mimeFor(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return 'application/pdf'
}

function buildSystem(docType: string): string {
  return (
    'Tu es un expert en affaires réglementaires pharmaceutiques (UEMOA/CEDEAO). Tu restructures ' +
    'un document fourni pour le rendre CONFORME au template officiel en vigueur, en utilisant ' +
    'EXCLUSIVEMENT les informations présentes dans le document source.\n' +
    'RÈGLE ABSOLUE — ZÉRO INVENTION :\n' +
    '- Chaque information du document produit provient du document source (recopie fidèle ; ' +
    'reformulation minimale uniquement pour l’intégration dans une rubrique).\n' +
    `- Si une rubrique du template n’a AUCUNE information correspondante dans la source, écris EXACTEMENT : ${MISSING_MARKER}\n` +
    '- N’utilise JAMAIS tes connaissances générales pour compléter une rubrique, même si tu connais ce médicament.\n' +
    '- Recopie VERBATIM : nombres, dosages, unités, dates, codes ATC, noms commerciaux, DCI, sociétés, adresses.\n' +
    frenchCalibration(docType)
  )
}

interface DossierContext {
  activity?: string
  titulaire?: string
  titulaireAdresse?: string
  fabricant?: string
  fabricantAdresse?: string
}

/**
 * Borne de chaque champ du contexte certifié. Le texte source est plafonné (`MAX_TEXT_CHARS`) ; ces
 * champs ne l'étaient pas, alors qu'ils entrent dans le prompt en position de CONFIANCE (« données
 * vérifiées ») et, en mode rubrique, une fois par rubrique. Une raison sociale tient dans 200
 * caractères ; au-delà, c'est un abus, pas une donnée.
 */
const MAX_CONTEXT_FIELD_CHARS = 200

const ctxField = (v: unknown): string =>
  typeof v === 'string' ? v.trim().slice(0, MAX_CONTEXT_FIELD_CHARS) : ''

/**
 * Contexte certifié du dossier (fiche produit Pharnos) : données VÉRIFIÉES utilisables au même
 * titre que le document source — rubrique 9 auto-résolue pour une nouvelle AMM, structure
 * 7.1 Titulaire / 7.2 Fabricant quand ils diffèrent. Ce ne sont pas des inventions du modèle.
 */
function dossierContextBlock(ctx?: DossierContext): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.activity === 'new_ma') {
    lines.push(
      "- Activité réglementaire : NOUVELLE demande d'AMM → pour la rubrique « DATE DE PREMIÈRE " +
        "AUTORISATION/DE RENOUVELLEMENT DE L'AUTORISATION », écris exactement : " +
        "« Sans objet — première demande d'AMM en cours d'instruction. »",
    )
  }
  const titulaire = ctxField(ctx.titulaire)
  const fabricant = ctxField(ctx.fabricant)
  const titulaireAdresse = ctxField(ctx.titulaireAdresse)
  const fabricantAdresse = ctxField(ctx.fabricantAdresse)
  if (titulaire) {
    lines.push(
      `- Titulaire de l'AMM (certifié) : ${titulaire}${titulaireAdresse ? ` — ${titulaireAdresse}` : ''}`,
    )
  }
  if (fabricant) {
    lines.push(
      `- Fabricant (certifié) : ${fabricant}${fabricantAdresse ? ` — ${fabricantAdresse}` : ''}`,
    )
  }
  if (titulaire && fabricant && titulaire.toLowerCase() !== fabricant.toLowerCase()) {
    lines.push(
      '- Titulaire ≠ fabricant : présente la rubrique titulaire en « 7.1. Titulaire de ' +
        "l'autorisation de mise sur le marché » (nom + adresse) et le fabricant en « 7.2. " +
        'Fabricant » (nom + adresse).',
    )
  }
  if (lines.length === 0) return ''
  return (
    '\nCONTEXTE CERTIFIÉ DU DOSSIER (fourni par Pharnos — données vérifiées, UTILISE-LES ; ' +
    'ce ne sont pas des inventions) :\n' +
    lines.join('\n') +
    '\n'
  )
}

function buildInstruction(docTypeLabel: string, spec: string, ctx?: DossierContext): string {
  return (
    `Restructure ce document (${docTypeLabel}) selon le template officiel ci-dessous. Produis le ` +
    'document COMPLET, rubrique par rubrique, dans l’ordre du template, en texte structuré ' +
    '(titres officiels puis paragraphes, une ligne vide entre les blocs, pas de commentaire).\n\n' +
    `${spec}\n` +
    dossierContextBlock(ctx) +
    `\nRAPPEL : rubrique sans information dans la source NI dans le contexte certifié → écris exactement ${MISSING_MARKER} (rien d’autre).`
  )
}

Deno.serve(async (req: Request) => {
  // Horodatage À L'ENTRÉE, et non juste avant l'appel IA : l'auth, le quota, le téléchargement
  // Storage (jusqu'à 12 Mo) et l'encodage base64 consomment du wall clock eux aussi. Un budget
  // calculé après eux ne retrancherait rien — le garde-fou serait mort-né (même piège que S0).
  const invokedAt = Date.now()
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'upgrade', reqId, op: 'cors', status: 'forbidden' })
    return new Response('origine non autorisée', { status: 403 })
  }
  const cors = corsHeaders(origin)
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json', 'x-request-id': reqId },
    })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405)

  // Auth — JWT Supabase de l'appelant.
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) {
    logJson({ fn: 'upgrade', reqId, op: 'auth', status: 'unauthorized' })
    return json({ error: 'non authentifié' }, 401)
  }
  const log = { fn: 'upgrade', reqId, user: await userHash(user.id) }

  // Entrée (bornée) : une pièce Storage OU un texte (traduction déjà produite).
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const b = (raw ?? {}) as {
    filePath?: string
    fileName?: string
    text?: string
    docType?: string
    countryCode?: string
    stream?: boolean
    /**
     * M2 — identifiant d'UNE rubrique du gabarit. Présent : protocole par rubrique (sortie
     * structurée + contrôle de citation). Absent : mode document historique, inchangé.
     */
    section?: string
    /** Contexte certifié du dossier (fiche produit Pharnos) — données vérifiées, pas des inventions. */
    dossierContext?: {
      activity?: string
      titulaire?: string
      titulaireAdresse?: string
      fabricant?: string
      fabricantAdresse?: string
    }
  }
  const docType = String(b.docType ?? '')
  const spec = specForDocType(docType)
  if (!spec) return json({ error: 'type de document non couvert par un template' }, 400)
  if (!b.filePath && !b.text) return json({ error: 'filePath ou text requis' }, 400)
  // `section` absent ⇒ mode document. Toute autre valeur qu'une chaîne est une ERREUR d'appelant,
  // pas un repli silencieux : retomber en mode document ferait produire un document entier
  // (~440 s) là où le worker n'attendait qu'une rubrique — un 546 garanti.
  if (b.section !== undefined && (typeof b.section !== 'string' || !b.section.trim())) {
    return json({ error: 'section doit être un identifiant de rubrique non vide' }, 400)
  }
  if (b.section && b.stream === true) {
    // Le mode rubrique rend un objet vérifié, pas un fil de texte : les deux ne se composent pas.
    return json({ error: 'section et stream sont exclusifs' }, 400)
  }
  const countryCode = b.countryCode
    ? String(b.countryCode).toUpperCase().slice(0, 2)
    : undefined

  // Verrou de quota IA par organisation (M1) — AVANT le téléchargement et l'appel Vertex.
  // CS1 : org active du client (header), vérifiée membre côté SQL — attribution multi-org correcte.
  const activeOrg = activeOrgFromRequest(req)
  const quota = await checkAiQuota(supabase, 'upgrade', activeOrg)
  if (!quota.allowed) {
    logJson({ ...log, op: 'quota', status: 'blocked', reason: quota.reason })
    return json(
      { error: 'quota_exceeded', reason: quota.reason, cap: quota.cap, remaining: quota.remaining },
      quota.status,
    )
  }

  // Source : pièce téléchargée (Storage, RLS via le JWT appelant) ou texte borné.
  let sourcePart: Part
  let sourceBytes = 0
  let inputTruncated = false
  /**
   * Texte source EXPLOITABLE pour le contrôle de citation (M2). Il n'existe qu'en mode texte : une
   * pièce PDF part telle quelle au modèle, sans extraction côté Edge (2 s de CPU, §8.6). Le mode
   * rubrique le dit alors franchement — verdict `unverifiable` — au lieu de faire croire à un
   * contrôle qui n'a pas eu lieu.
   */
  let sourceText: string | null = null
  if (b.filePath) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(String(b.filePath))
    if (error || !data) return json({ error: 'document introuvable' }, 404)
    const buf = new Uint8Array(await data.arrayBuffer())
    if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
      return json({ error: 'document illisible ou trop volumineux' }, 422)
    }
    sourceBytes = buf.byteLength
    sourcePart = {
      inlineData: { mimeType: mimeFor(String(b.fileName ?? 'document')), data: bytesToBase64(buf) },
    }
  } else {
    const rawText = String(b.text)
    // Couper l'ENTRÉE sans le dire produit une mise en conformité « complète » d'un document
    // amputé — indétectable côté client. On tronque toujours (borne de sécurité), mais on le signale.
    inputTruncated = rawText.length > MAX_TEXT_CHARS
    const text = rawText.slice(0, MAX_TEXT_CHARS)
    if (!text.trim()) return json({ error: 'texte source vide' }, 400)
    sourceBytes = text.length
    sourceText = text
    sourcePart = { text: `DOCUMENT SOURCE :\n${text}` }
  }

  const system = buildSystem(docType)
  const started = Date.now()
  const sectionId = b.section ? String(b.section).slice(0, 40) : ''
  logJson({
    ...log,
    op: 'start',
    inputTruncated,
    docType,
    bytes: sourceBytes,
    fromText: !b.filePath,
    stream: b.stream === true,
    ...(sectionId ? { section: sectionId } : {}),
  })

  // ── Mode RUBRIQUE (M2) ───────────────────────────────────────────────────────────────────────
  // Une rubrique du gabarit = un appel (§8.1). Sortie structurée + citation source vérifiée en
  // code : c'est la brique que le worker asynchrone (M4) appellera 28 fois pour un RCP complet.
  if (sectionId) {
    const rubric = findRubric(spec, sectionId)
    if (!rubric) return json({ error: 'rubrique inconnue pour ce template' }, 400)
    // Sans texte source, le contrôle de citation ne peut PAS s'exercer : la réponse serait
    // indistinguable d'une rubrique vérifiée, et la pièce (jusqu'à 12 Mo) repartirait à chaque
    // rubrique pour rien. L'extraction PDF appartient au navigateur (§8.6), pas à l'Edge.
    if (!sourceText) {
      return json({ error: 'mode rubrique : texte source requis (extraction côté client)' }, 400)
    }
    const budgetMs = Math.min(SECTION_BUDGET_MS, UPGRADE_TIMEOUT_MS - (Date.now() - invokedAt))
    if (budgetMs < MIN_SECTION_BUDGET_MS) {
      // Le prélude a mangé le budget : lancer un appel qui ne peut pas finir sous le mur produirait
      // un 546 opaque de la plateforme. On le dit franchement, et le worker (M4) peut rejouer.
      logJson({ ...log, op: 'section', section: sectionId, status: 'no_budget', budgetMs })
      return json({ error: 'budget insuffisant pour cette rubrique', reason: 'no_budget' }, 503)
    }
    // Accumulateur de tokens EXTERNALISÉ : sur le chemin d'erreur (troncature, refus final), les
    // appels déjà payés doivent quand même débiter le quota — sinon il suffit de faire échouer la
    // génération pour consommer l'IA gratuitement.
    const usage: Usage = { in: 0, out: 0 }
    const certifiedContext = dossierContextBlock(b.dossierContext)
    try {
      const s = await runWithUsage(usage, () =>
        generateSection(generateParts, {
          spec,
          rubric,
          sourceParts: [sourcePart],
          source: prepareSource(sourceText),
          // La CITATION doit vivre dans le document ; l'ANCRAGE des chiffres accepte en plus le
          // contexte certifié. Sans cela, un numéro de RCCM ou une adresse fournis par Pharnos
          // feraient rétrograder la rubrique 7 comme s'ils étaient inventés.
          grounding: prepareSource(`${sourceText}\n${certifiedContext}`),
          system,
          countryCode,
          extraContext: certifiedContext,
          // Fournisseur ÉPINGLÉ : le décodage contraint n'existe pas chez tous (§3.2), et
          // `AI_PROVIDER=vertex` ferait rendre du texte libre là où on attend un schéma.
          provider: 'anthropic',
          budgetMs,
        }))
      logJson({
        ...log,
        op: 'section',
        section: s.sectionId,
        ms: Date.now() - started,
        status: 'ok',
        verdict: s.verdict,
        attempts: s.attempts,
        downgraded: s.downgraded,
        ...(s.downgradeReason ? { downgradeReason: s.downgradeReason } : {}),
        ungrounded: s.ungrounded.length,
        chars: s.content.length,
      })
      return json({
        docType,
        section: {
          id: s.sectionId,
          title: s.title,
          status: s.status,
          content: s.content,
          // Traçabilité ALCOA++ : l'expert RA voit LE passage source qui justifie la rubrique, et
          // le verdict dit si ce passage a pu être retrouvé automatiquement dans le document.
          evidence: s.evidence,
          verdict: s.verdict,
          attempts: s.attempts,
          downgraded: s.downgraded,
          ...(s.downgradeReason ? { downgradeReason: s.downgradeReason } : {}),
          // Les valeurs en cause, pas seulement leur nombre : l'expert RA doit savoir CE QUI n'a
          // pas été retrouvé pour trancher entre coquille d'extraction et invention.
          ...(s.ungrounded.length ? { ungrounded: s.ungrounded } : {}),
        },
        ...(inputTruncated ? { inputTruncated: true } : {}),
      })
    } catch (e) {
      const err = String((e as Error).message).slice(0, 300)
      logJson({
        ...log,
        op: 'section',
        section: sectionId,
        ms: Date.now() - started,
        status: 'error',
        err,
      })
      // Le détail reste dans les journaux : il porte des messages internes (secret manquant, corps
      // d'erreur du fournisseur) qui n'apprennent rien au client et renseignent un attaquant.
      return json({ error: 'mise en conformité indisponible', reason: 'provider_error' }, 502)
    } finally {
      recordAiUsage(supabase, 'upgrade', usage, activeOrg)
    }
  }

  const parts: Part[] = [
    { text: buildInstruction(spec.label, specPromptText(spec, countryCode), b.dossierContext) },
    sourcePart,
  ]

  // Mode STREAMING (opt-in) : le document conforme s'écrit au fil de l'eau (même UX que la
  // traduction) ; sans le flag, réponse JSON complète.
  if (b.stream === true) {
    try {
      const out = await streamSimpleSse(
        parts,
        { system, maxOutputTokens: 8192, temperature: 0, timeoutMs: UPGRADE_TIMEOUT_MS },
        {
          onDone: (chars) =>
            logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'ok', chars }),
          onUsage: (uin, uout) =>
            recordAiUsage(supabase, 'upgrade', { in: uin, out: uout }, activeOrg),
        },
      )
      return new Response(out, {
        status: 200,
        headers: {
          ...cors,
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-request-id': reqId,
        },
      })
    } catch (e) {
      const err = String((e as Error).message).slice(0, 300)
      logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'error', err })
      return json({ error: 'mise en conformité indisponible', reason: 'provider_error' }, 502)
    }
  }

  let text: string
  try {
    const r = await withUsage(() =>
      generateParts(parts, {
        system,
        maxOutputTokens: 8192,
        temperature: 0,
        timeoutMs: UPGRADE_TIMEOUT_MS,
      }),
    )
    text = r.result
    recordAiUsage(supabase, 'upgrade', r.usage, activeOrg)
  } catch (e) {
    const err = String((e as Error).message).slice(0, 300)
    logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'error', err })
    return json({ error: 'mise en conformité indisponible', reason: 'provider_error' }, 502)
  }
  if (!text.trim()) {
    logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'empty' })
    return json({ error: 'mise en conformité vide' }, 502)
  }

  logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'ok', chars: text.length })
  // Champ ADDITIF : le client peut avertir que la source a été coupée avant traitement. Les
  // clients existants l'ignorent — aucune rupture de contrat.
  return json({ text, docType, ...(inputTruncated ? { inputTruncated: true } : {}) })
})
