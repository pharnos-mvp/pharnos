// Edge Function `regafy-ai` v3 — copilote RA (assistif only). Deux analyses Gemini/Vertex EN PARALLÈLE :
//   1) Conformité des lettres (texte) — avec la date de l'opération.
//   2) Validité des pièces (MULTIMODAL, BATCH) — Gemini lit TOUS les PDF reçus en UN SEUL appel et
//      renvoie un résultat par pièce (date d'expiration / durée énoncée) → validité restante vs la
//      date de l'opération → admin ≥ 6 mois, COA ≥ 18 mois (expiré → erreur, absente → à vérifier).
// Le front contrôle quelles pièces envoyer : toutes à l'ouverture (1 batch), puis seulement les
// nouvelles à chaque upload (analyse incrémentale). Chaque constat de validité porte un `pieceId`.
// Contrat sécurité (ADR 0002) : JWT vérifié, bornes, Storage via le JWT appelant (RLS), no-train.
import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  checkConformityFile,
  checkConformityText,
  conformityMessage,
} from '../_shared/conformity-check.ts'
import { specForDocType } from '../_shared/conformity-specs.ts'
import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, timed, userHash } from '../_shared/log.ts'
import {
  asLocale,
  langName,
  regafyMessages,
  respondIn,
  type RegafyLocale,
} from '../_shared/regafy-i18n.ts'
import { checkAiQuota, recordAiUsage } from '../_shared/quota.ts'
import { withUsage } from '../_shared/usage.ts'
import { generateParts, generateText, type Part } from '../_shared/vertex.ts'

interface LetterInput {
  nodeNumber: string
  nodeLabel: string
  title: string
  text: string
}
interface PieceInput {
  pieceId: string
  nodeNumber: string
  nodeLabel: string
  docType: string
  category: string
  fileName: string
  filePath: string
  /** Date d'expiration DÉCLARÉE par l'utilisateur (Monitor) — Regafy contre-expertise (O3). */
  declaredExpiry?: string
}
interface Finding {
  pieceId?: string
  nodeNumber: string
  nodeLabel: string
  severity: 'error' | 'warning' | 'info'
  message: string
  /** Document à traduire (langue ≠ langue du pays) — pour le bouton « Traduire ». */
  translate?: boolean
  /** Langue détectée du document (code ISO 639-1). */
  language?: string
  /** Document non conforme au template en vigueur — pour le bouton « Upgrader » (additif). */
  upgrade?: boolean
  /** Rubriques manquantes/non conformes (détail du constat de conformité). */
  missing?: string[]
  /** Constat POSITIF (validité OK) — remarque verte, non bloquante. */
  ok?: boolean
  /** Date de fin de validité relevée (yyyy-mm-dd) — affichée dans le verdict conforme (point 4). */
  validUntil?: string
  /** Mois de validité restants relevés — affichés dans le verdict conforme. */
  validityMonths?: number
}

// Périmètre minimal du client utilisé par l'analyse : téléchargement Storage (RLS via le JWT
// appelant). Interface structurelle → découplée des génériques de supabase-js (deno check).
interface Supa {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>
    }
  }
}

const MAX_LETTERS = 8
const MAX_TEXT = 8000
const MAX_PIECES = 12
const MAX_CONFORMITY_TEXTS = 6
const MAX_CONFORMITY_TEXT_CHARS = 60_000
const MAX_FILE_BYTES = 12 * 1024 * 1024
const STORAGE_BUCKET = 'documents'
// Modèle pour l'extraction de validité (dates critiques). Défaut : flash-lite (seul confirmé
// disponible en location `global`). Surchargeable via le secret GCP_MODEL_VALIDITY (ex. un flash
// plus précis si dispo dans la location utilisée).
const VALIDITY_MODEL = Deno.env.get('GCP_MODEL_VALIDITY') || 'gemini-3.1-flash-lite'

const sev = (s: unknown): Finding['severity'] => (s === 'error' || s === 'warning' ? s : 'info')

function todayISO(input?: string): string {
  return input && /^\d{4}-\d{2}-\d{2}/.test(input)
    ? input.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
}

function monthsLeft(expiry: string, from: string): number {
  return (new Date(expiry).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24 * 30.4375)
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

const isISODate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

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

// Types de documents soumis à la DÉTECTION DE LANGUE (≠ pièces de validité administratives).
const LANG_TYPES = new Set(['rcp', 'notice', 'labeling', 'artwork'])

// Documents dont le NOM DE PRODUIT doit concorder avec le produit du dossier (anti « mauvais doc »).
const NAME_CHECK_TYPES = new Set(['rcp', 'notice', 'labeling', 'artwork', 'amm', 'copp', 'fsc', 'coa'])
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function productMatches(docName: string, dossierName: string): boolean {
  const a = normName(docName)
  const b = normName(dossierName)
  if (!a || !b) return true // impossible à juger → ne pas alerter
  if (a.includes(b) || b.includes(a)) return true
  const tB = b.split(' ')[0]
  return tB.length >= 3 && a.includes(tB)
}

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0])
      } catch {
        return null
      }
    }
    return null
  }
}

// ── 1) Conformité des lettres (texte) ───────────────────────────────────────────────────────
// `degraded: true` = l'analyse a ÉCHOUÉ (≠ « lettres conformes ») : le client doit le dire à
// l'utilisateur — un échec silencieux serait un faux négatif (lettre crue conforme à tort).
async function analyzeLetters(
  letters: LetterInput[],
  ctx: { opDate: string; productName?: string; titulaire?: string; country?: string; agency?: string },
  loc: RegafyLocale,
  log: Record<string, unknown>,
): Promise<{ findings: Finding[]; degraded: boolean }> {
  if (letters.length === 0) return { findings: [], degraded: false }
  const system =
    'Tu es un expert en affaires réglementaires pharmaceutiques (UEMOA/CEDEAO). Tu repères les ' +
    "non-conformités des lettres administratives (CTD Module 1) : formule d'appel/politesse, " +
    'destinataire/agence incohérents, champs entre crochets non remplis, dates incohérentes, ' +
    'titulaire absent, ton inadapté. Assistance uniquement. Messages courts et actionnables.' +
    respondIn(loc)
  const prompt =
    `Date de l'opération en cours : ${ctx.opDate} (utilise-la pour juger les dates). ` +
    `Produit : ${ctx.productName ?? '(n/a)'} | Titulaire : ${ctx.titulaire ?? '(n/a)'} | ` +
    `Pays : ${ctx.country ?? '(n/a)'} | Agence : ${ctx.agency ?? '(n/a)'}.\n\n` +
    'Renvoie UNIQUEMENT {"findings":[{"nodeNumber":"<n° ou \'\'>","severity":"error|warning|info","message":"<constat>"}]}. ' +
    "N'invente rien ; lettre conforme = aucun finding. Max 10.\n\nLettres :\n" +
    letters.map((l, i) => `[#${i + 1} | nœud ${l.nodeNumber} | ${l.title}]\n${l.text}`).join('\n\n---\n\n')
  try {
    const parsed = (await timed(log, 'letters', () =>
      generateText(prompt, {
        system,
        json: true,
        maxOutputTokens: 1024,
        temperature: 0.2,
        timeoutMs: 30_000,
      }).then(extractJson),
    )) as { findings?: Array<{ nodeNumber?: string; severity?: string; message?: string }> } | null
    const findings = (parsed?.findings ?? [])
      .slice(0, 10)
      .map((f) => {
        const node = letters.find((l) => l.nodeNumber === String(f?.nodeNumber ?? ''))
        return {
          nodeNumber: String(f?.nodeNumber ?? ''),
          nodeLabel: node?.nodeLabel ?? '',
          severity: sev(f?.severity),
          message: String(f?.message ?? '').slice(0, 400),
        }
      })
      .filter((f) => f.message.trim())
    return { findings, degraded: false }
  } catch (_e) {
    // L'erreur est déjà loggée par timed(). Surtout PAS de [] silencieux : on remonte degraded.
    return { findings: [], degraded: true }
  }
}

// ── 2) Validité des pièces (MULTIMODAL, 1 SEUL appel pour tout le lot) ───────────────────────
async function analyzeValidityBatch(
  supabase: Supa,
  pieces: PieceInput[],
  opDate: string,
  agency: string,
  targetLang: string,
  productName: string,
  country: string,
  countryCode: string | undefined,
  loc: RegafyLocale,
  log: Record<string, unknown>,
): Promise<Finding[]> {
  if (pieces.length === 0) return []
  const M = regafyMessages(loc)
  const valSystem =
    'Tu es un expert RA. On te fournit plusieurs documents réglementaires (GMP/BPF, COPP, FSC, ML, ' +
    "AMM, COA…). Pour CHACUN, repère : (a) la date d'expiration / fin de validité si elle est écrite ; " +
    "sinon (b) la DATE D'ÉMISSION/DÉLIVRANCE et la DURÉE de validité énoncée (ex. « 2 ans à compter de la " +
    "date d'émission » → 24 mois). Ne déduis jamais une date ou une durée non écrite. Réponds en JSON STRICT."
  const requirement = M.requirement(agency)

  const downloaded = await Promise.all(
    pieces.map(async (p) => {
      try {
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(p.filePath)
        if (error || !data) return null
        const buf = new Uint8Array(await data.arrayBuffer())
        if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) return null
        return { p, mime: mimeFor(p.fileName), b64: bytesToBase64(buf) }
      } catch (_e) {
        return null
      }
    }),
  )
  const valid = downloaded.filter((x): x is NonNullable<typeof x> => x !== null)
  const findings: Finding[] = []
  const base = (p: PieceInput) => ({ pieceId: p.pieceId, nodeNumber: p.nodeNumber, nodeLabel: p.nodeLabel })

  // Documents illisibles (téléchargement échoué / trop gros) → à vérifier.
  for (const p of pieces) {
    if (!valid.some((v) => v.p.pieceId === p.pieceId)) {
      findings.push({
        ...base(p),
        severity: 'warning',
        message: M.unreadable((p.docType || 'pièce').toUpperCase()),
      })
    }
  }
  if (valid.length === 0) return findings

  // Extraction 1 DOCUMENT PAR APPEL (focus maximal, fiable, échec isolé à un doc), modèle plus
  // précis pour la validité + réessai. Bien plus robuste qu'un seul gros appel multimodal (qui
  // tronquait/confondait → dates fausses ou « aucune date » à tort).
  type ValResult = {
    found?: boolean
    expiryDate?: string | null
    issueDate?: string | null
    validityMonths?: number | null
    validityStatement?: string | null
    dateText?: string | null
    language?: string | null
    productName?: string | null
  }
  const askOne = async (v: (typeof valid)[number]): Promise<ValResult | null> => {
    const header =
      `Date de l'opération : ${opDate}. Analyse CE SEUL document réglementaire (type: ${v.p.docType}). ` +
      'Renvoie STRICTEMENT un objet JSON : {"found":true|false,"expiryDate":"yyyy-mm-dd"|null,' +
      '"issueDate":"yyyy-mm-dd"|null,"validityMonths":<entier (mois)|null>,"validityStatement":"durée énoncée|null",' +
      '"dateText":"la/les date(s) RECOPIÉE(S) VERBATIM du document|null",' +
      '"language":"code ISO 639-1 de la langue dominante","productName":"nom commercial du médicament|null"}. ' +
      "expiryDate = fin de validité si écrite ; sinon issueDate (date d'émission) ET validityMonths (durée énoncée). " +
      "RÈGLE ABSOLUE anti-hallucination : recopie la date VERBATIM dans dateText ; si tu n'es pas CERTAIN d'une " +
      "date, mets found:false et toutes les dates à null. N'INVENTE JAMAIS. productName = nom COMMERCIAL (ni DCI, ni fabricant)."
    const parts: Part[] = [{ text: header }, { inlineData: { mimeType: v.mime, data: v.b64 } }]
    // Le retry borné (429/5xx/réseau uniquement) vit dans vertex.ts — l'ancienne boucle aveugle
    // re-tentait même les 400 (inutile et coûteux). Échec → null → constat honnête en aval.
    try {
      const parsed = extractJson(
        await generateParts(parts, {
          system: valSystem,
          json: true,
          maxOutputTokens: 512,
          temperature: 0,
          model: VALIDITY_MODEL,
        }),
      ) as ValResult | null
      if (parsed && typeof parsed === 'object') return parsed
    } catch (e) {
      logJson({
        ...log,
        op: 'validity-piece',
        status: 'error',
        err: String(e instanceof Error ? e.message : e).slice(0, 300),
      })
    }
    return null
  }

  const resultByPiece = new Map<string, ValResult>()
  const CONC = 5 // concurrence limitée (n'inonde pas Vertex sur un gros dossier)
  for (let i = 0; i < valid.length; i += CONC) {
    const slice = valid.slice(i, i + CONC)
    const rs = await Promise.all(slice.map((v) => askOne(v)))
    slice.forEach((v, j) => {
      const r = rs[j]
      if (r) resultByPiece.set(v.p.pieceId, r)
    })
  }

  // ── CONFORMITÉ AU TEMPLATE (Regafy Upgrade) : TOUTES les pièces des 5 types couverts, quelle
  // que soit leur langue — la conformité est structurelle (« conformité d'abord, traduction
  // après ») ; la langue détectée est portée sur le constat pour proposer la traduction de la
  // VERSION CONFORME ensuite. Réutilise le b64 déjà téléchargé pour la validité.
  const conformable = valid.filter((v) => specForDocType(v.p.docType))
  for (let i = 0; i < conformable.length; i += CONC) {
    const slice = conformable.slice(i, i + CONC)
    const rs = await Promise.all(
      slice.map((v) => checkConformityFile(v.mime, v.b64, v.p.docType, countryCode, log, loc)),
    )
    slice.forEach((v, j) => {
      const c = rs[j]
      // Échec d'analyse (null) → silence honnête : pas de constat inventé, le cache côté client
      // n'enregistre rien de faux ; conforme → pas de bruit.
      if (c && !c.conforme && c.manquantes.length > 0) {
        findings.push({
          ...base(v.p),
          severity: 'warning',
          message: conformityMessage(v.p.docType, loc),
          upgrade: true,
          missing: c.manquantes,
          ...(c.langue ? { language: c.langue } : {}),
        })
      }
    })
  }

  valid.forEach((v) => {
    const p = v.p
    const r = resultByPiece.get(p.pieceId) ?? {}
    const hasResult = resultByPiece.has(p.pieceId)
    const label = (p.docType || 'pièce').toUpperCase()

    // ── CONCORDANCE PRODUIT : le document doit concerner le produit du dossier (anti « mauvais doc »).
    if (NAME_CHECK_TYPES.has(p.docType) && productName) {
      const docName = String(r.productName ?? '').trim()
      if (docName && !productMatches(docName, productName)) {
        findings.push({
          ...base(p),
          severity: 'error',
          message: M.wrongProduct(label, docName.slice(0, 60), productName),
        })
      }
    }

    // ── LANGUE (RCP, Notice, Étiquette, Artwork) : signaler si ≠ langue officielle du pays.
    if (LANG_TYPES.has(p.docType)) {
      const lang = String(r.language ?? '')
        .toLowerCase()
        .slice(0, 2)
      if (lang && targetLang && lang !== targetLang) {
        findings.push({
          ...base(p),
          severity: 'warning',
          message: M.langMismatch(label, langName(lang, loc), country, langName(targetLang, loc)),
          translate: true,
          language: lang,
        })
      }
      return
    }

    // ── VALIDITÉ (pièces admin + COA) : expiration explicite, sinon (date d'émission + durée).
    const min = p.docType === 'coa' ? 18 : 6
    let expiry: string | null = isISODate(r.expiryDate) ? r.expiryDate.slice(0, 10) : null
    const months = Math.round(Number(r.validityMonths))
    let derived = false
    if (!expiry && isISODate(r.issueDate) && months > 0) {
      expiry = addMonths(r.issueDate.slice(0, 10), months)
      derived = true
    }

    // ── CONTRE-EXPERTISE (O3) : Regafy LIT la date dans le document ; si elle DIVERGE (> 1 mois) de
    // la date DÉCLARÉE par l'utilisateur (Monitor), on le signale — l'IA peut se tromper, l'humain
    // aussi : human-in-the-loop. Seuil 31 j pour ignorer les arrondis fin de mois.
    if (expiry && isISODate(p.declaredExpiry)) {
      const decl = p.declaredExpiry.slice(0, 10)
      const driftDays = Math.abs(
        (new Date(expiry).getTime() - new Date(decl).getTime()) / (1000 * 60 * 60 * 24),
      )
      if (driftDays > 31) {
        findings.push({
          ...base(p),
          severity: 'warning',
          message: M.drift(label, expiry, derived, decl),
        })
      }
    }

    if (expiry) {
      const m = monthsLeft(expiry, opDate)
      const how = M.how(derived, months)
      if (m < 0) {
        findings.push({ ...base(p), severity: 'error', message: M.expired(label, expiry, how) })
      } else if (m < min) {
        findings.push({
          ...base(p),
          severity: 'warning',
          message: M.lowValidity(label, Math.floor(m), min, requirement, expiry, how),
        })
      } else {
        // Valide (≥ seuil) : constat POSITIF DATÉ — la date relevée figure dans le verdict
        // conforme (point 4). Le client le reformule avec le nom de fichier de la pièce.
        findings.push({
          ...base(p),
          severity: 'info',
          ok: true,
          validUntil: expiry,
          validityMonths: Math.floor(m),
          message: M.validOk(label, Math.floor(m), expiry, how),
        })
      }
    } else if (r.found && r.validityStatement) {
      findings.push({
        ...base(p),
        severity: 'info',
        message: M.statedValidity(label, String(r.validityStatement).slice(0, 120)),
      })
    } else if (!hasResult) {
      // Aucun résultat du modèle pour ce document → ÉCHEC d'extraction. Vocabulaire HONNÊTE : ne
      // jamais affirmer « aucune date » (ce serait faux si le document en contient une). Zéro hallucination.
      findings.push({
        ...base(p),
        severity: 'warning',
        message: M.extractionFailed(label),
      })
    } else {
      // Le modèle a lu le document mais n'y a (avec prudence) détecté aucune date/durée de validité.
      findings.push({
        ...base(p),
        severity: 'warning',
        message: M.notDetected(label),
      })
    }
  })
  return findings
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  // Origine navigateur hors whitelist → refus avant tout travail (les appels sans Origin —
  // curl, server-to-server — ne sont pas un contexte CORS ; le JWT reste la barrière).
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'regafy-ai', reqId, op: 'cors', status: 'forbidden' })
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
    logJson({ fn: 'regafy-ai', reqId, op: 'auth', status: 'unauthorized' })
    return json({ error: 'non authentifié' }, 401)
  }
  const log = { fn: 'regafy-ai', reqId, user: await userHash(user.id) }

  // Verrou de quota IA par organisation (M1) — AVANT tout appel Vertex. Fail-closed.
  const quota = await checkAiQuota(supabase, 'regafy')
  if (!quota.allowed) {
    logJson({ ...log, op: 'quota', status: 'blocked', reason: quota.reason })
    return json(
      { error: 'quota_exceeded', reason: quota.reason, cap: quota.cap, remaining: quota.remaining },
      quota.status,
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const b = (raw ?? {}) as {
    operationDate?: string
    productName?: string
    titulaire?: string
    country?: string
    /** Code ISO-2 du pays cible (additif — filtre des mentions pays-spécifiques des templates). */
    countryCode?: string
    agency?: string
    targetLang?: string
    /** Langue d'AFFICHAGE (UI) de l'utilisateur — langue des constats. Défaut FR. */
    uiLang?: string
    letters?: LetterInput[]
    pieces?: PieceInput[]
    /** Textes à vérifier contre le template en vigueur (traductions) — additif. */
    conformityTexts?: Array<{
      id?: string
      nodeNumber?: string
      nodeLabel?: string
      docType?: string
      text?: string
    }>
  }
  const opDate = todayISO(b.operationDate)
  const loc = asLocale(b.uiLang)
  const letters = (Array.isArray(b.letters) ? b.letters : []).slice(0, MAX_LETTERS).map((l) => ({
    nodeNumber: String(l?.nodeNumber ?? ''),
    nodeLabel: String(l?.nodeLabel ?? ''),
    title: String(l?.title ?? '').slice(0, 200),
    text: String(l?.text ?? '').slice(0, MAX_TEXT),
  }))
  const pieces = (Array.isArray(b.pieces) ? b.pieces : [])
    .filter((p) => p?.filePath && p?.pieceId)
    .slice(0, MAX_PIECES)
    .map((p) => ({
      pieceId: String(p.pieceId),
      nodeNumber: String(p.nodeNumber ?? ''),
      nodeLabel: String(p.nodeLabel ?? ''),
      docType: String(p.docType ?? ''),
      category: String(p.category ?? ''),
      fileName: String(p.fileName ?? 'document'),
      filePath: String(p.filePath),
      declaredExpiry: p.declaredExpiry ? String(p.declaredExpiry).slice(0, 10) : undefined,
    }))
  const countryCode = b.countryCode ? String(b.countryCode).toUpperCase().slice(0, 2) : undefined
  // Traductions à vérifier contre le template (bornées : texte 60 k chars, 6 documents max).
  const conformityTexts = (Array.isArray(b.conformityTexts) ? b.conformityTexts : [])
    .filter((t) => t?.id && t?.docType && t?.text && specForDocType(String(t.docType)))
    .slice(0, MAX_CONFORMITY_TEXTS)
    .map((t) => ({
      id: String(t.id),
      nodeNumber: String(t.nodeNumber ?? ''),
      nodeLabel: String(t.nodeLabel ?? ''),
      docType: String(t.docType),
      text: String(t.text).slice(0, MAX_CONFORMITY_TEXT_CHARS),
    }))

  // Les analyses tournent EN PARALLÈLE (lettres + batch validité/conformité + traductions).
  const started = Date.now()
  logJson({
    ...log,
    op: 'start',
    letters: letters.length,
    pieces: pieces.length,
    conformityTexts: conformityTexts.length,
  })
  try {
    const { result, usage } = await withUsage(async () => {
      const [letterResult, validityFindings, textConformityFindings] = await Promise.all([
      analyzeLetters(
        letters,
        {
          opDate,
          productName: b.productName,
          titulaire: b.titulaire,
          country: b.country,
          agency: b.agency,
        },
        loc,
        log,
      ),
      timed(log, 'validity', () =>
        analyzeValidityBatch(
          supabase,
          pieces,
          opDate,
          b.agency ?? '',
          b.targetLang ?? '',
          b.productName ?? '',
          b.country ?? '',
          countryCode,
          loc,
          log,
        ),
      ),
      timed(log, 'text-conformity', async () => {
        const out: Finding[] = []
        for (const t of conformityTexts) {
          const c = await checkConformityText(t.text, t.docType, countryCode, log, loc)
          if (c && !c.conforme && c.manquantes.length > 0) {
            out.push({
              pieceId: t.id,
              nodeNumber: t.nodeNumber,
              nodeLabel: t.nodeLabel,
              severity: 'warning',
              message: conformityMessage(t.docType, loc),
              upgrade: true,
              missing: c.manquantes,
              ...(c.langue ? { language: c.langue } : {}),
            })
          }
        }
        return out
      }),
    ])

    const findings = [...letterResult.findings, ...validityFindings, ...textConformityFindings]
    logJson({
      ...log,
      op: 'done',
      ms: Date.now() - started,
      findings: findings.length,
      degraded: letterResult.degraded,
    })
      // `degraded` (additif, optionnel) : l'analyse des lettres a échoué — le client doit
      // l'afficher plutôt que de laisser croire « aucun constat = conforme ».
      return letterResult.degraded ? { findings, degraded: true } : { findings }
    })
    recordAiUsage(supabase, 'regafy', usage)
    return json(result)
  } catch (e) {
    // Filet global : réponse JSON propre (avec CORS) plutôt qu'un 500 brut du runtime.
    logJson({
      ...log,
      op: 'fatal',
      ms: Date.now() - started,
      err: String(e instanceof Error ? e.message : e).slice(0, 300),
    })
    return json({ error: 'analyse indisponible — réessayez plus tard' }, 502)
  }
})
