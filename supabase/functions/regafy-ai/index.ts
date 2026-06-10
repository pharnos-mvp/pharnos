// Edge Function `regafy-ai` v3 — copilote RA (assistif only). Deux analyses Gemini/Vertex EN PARALLÈLE :
//   1) Conformité des lettres (texte) — avec la date de l'opération.
//   2) Validité des pièces (MULTIMODAL, BATCH) — Gemini lit TOUS les PDF reçus en UN SEUL appel et
//      renvoie un résultat par pièce (date d'expiration / durée énoncée) → validité restante vs la
//      date de l'opération → admin ≥ 6 mois, COA ≥ 18 mois (expiré → erreur, absente → à vérifier).
// Le front contrôle quelles pièces envoyer : toutes à l'ouverture (1 batch), puis seulement les
// nouvelles à chaque upload (analyse incrémentale). Chaque constat de validité porte un `pieceId`.
// Contrat sécurité (ADR 0002) : JWT vérifié, bornes, Storage via le JWT appelant (RLS), no-train.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { generateParts, generateText, type Part } from '../_shared/vertex.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
}

type Supa = ReturnType<typeof createClient>

const MAX_LETTERS = 8
const MAX_TEXT = 8000
const MAX_PIECES = 12
const MAX_FILE_BYTES = 12 * 1024 * 1024
const STORAGE_BUCKET = 'documents'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

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
const LANG_NAMES: Record<string, string> = {
  fr: 'français',
  en: 'anglais',
  pt: 'portugais',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  ar: 'arabe',
  nl: 'néerlandais',
}
function langName(code: string): string {
  const c = (code || '').toLowerCase().slice(0, 2)
  return LANG_NAMES[c] ?? code
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
async function analyzeLetters(
  letters: LetterInput[],
  ctx: { opDate: string; productName?: string; titulaire?: string; country?: string; agency?: string },
): Promise<Finding[]> {
  if (letters.length === 0) return []
  const system =
    'Tu es un expert en affaires réglementaires pharmaceutiques (UEMOA/CEDEAO). Tu repères les ' +
    "non-conformités des lettres administratives (CTD Module 1) : formule d'appel/politesse, " +
    'destinataire/agence incohérents, champs entre crochets non remplis, dates incohérentes, ' +
    'titulaire absent, ton inadapté. Assistance uniquement. Français, messages courts et actionnables.'
  const prompt =
    `Date de l'opération en cours : ${ctx.opDate} (utilise-la pour juger les dates). ` +
    `Produit : ${ctx.productName ?? '(n/a)'} | Titulaire : ${ctx.titulaire ?? '(n/a)'} | ` +
    `Pays : ${ctx.country ?? '(n/a)'} | Agence : ${ctx.agency ?? '(n/a)'}.\n\n` +
    'Renvoie UNIQUEMENT {"findings":[{"nodeNumber":"<n° ou \'\'>","severity":"error|warning|info","message":"<constat>"}]}. ' +
    "N'invente rien ; lettre conforme = aucun finding. Max 10.\n\nLettres :\n" +
    letters.map((l, i) => `[#${i + 1} | nœud ${l.nodeNumber} | ${l.title}]\n${l.text}`).join('\n\n---\n\n')
  try {
    const parsed = extractJson(
      await generateText(prompt, { system, json: true, maxOutputTokens: 1024, temperature: 0.2 }),
    ) as { findings?: Array<{ nodeNumber?: string; severity?: string; message?: string }> } | null
    return (parsed?.findings ?? [])
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
  } catch (_e) {
    return []
  }
}

// ── 2) Validité des pièces (MULTIMODAL, 1 SEUL appel pour tout le lot) ───────────────────────
async function analyzeValidityBatch(
  supabase: Supa,
  pieces: PieceInput[],
  opDate: string,
  agency: string,
  targetLang: string,
): Promise<Finding[]> {
  if (pieces.length === 0) return []
  const valSystem =
    'Tu es un expert RA. On te fournit plusieurs documents réglementaires (GMP/BPF, COPP, FSC, ML, ' +
    "AMM, COA…). Pour CHACUN, repère : (a) la date d'expiration / fin de validité si elle est écrite ; " +
    "sinon (b) la DATE D'ÉMISSION/DÉLIVRANCE et la DURÉE de validité énoncée (ex. « 2 ans à compter de la " +
    "date d'émission » → 24 mois). Ne déduis jamais une date ou une durée non écrite. Réponds en JSON STRICT."
  const requirement = agency ? ` par ${agency}` : ''

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
        message: `${(p.docType || 'pièce').toUpperCase()} : document illisible — à vérifier.`,
      })
    }
  }
  if (valid.length === 0) return findings

  const header =
    `Date de l'opération : ${opDate}. Tu reçois ${valid.length} document(s) réglementaire(s) numérotés. ` +
    'Pour CHAQUE document, renvoie STRICTEMENT : {"results":[{"index":<n° à partir de 1>,"found":true|false,' +
    '"expiryDate":"yyyy-mm-dd"|null,"issueDate":"yyyy-mm-dd"|null,"validityMonths":<entier (mois)|null>,' +
    '"validityStatement":"texte de la durée énoncée|null","language":"code ISO 639-1 de la langue dominante (fr, en, pt…)"}]}. ' +
    "expiryDate = fin de validité si écrite ; sinon issueDate (date d'émission) ET validityMonths (durée en mois). " +
    'language = langue dominante du contenu du document.'
  const parts: Part[] = [{ text: header }]
  valid.forEach((v, i) => {
    parts.push({ text: `--- Document ${i + 1} (type: ${v.p.docType}) :` })
    parts.push({ inlineData: { mimeType: v.mime, data: v.b64 } })
  })

  let results: Array<{
    index?: number
    found?: boolean
    expiryDate?: string | null
    issueDate?: string | null
    validityMonths?: number | null
    validityStatement?: string | null
    language?: string | null
  }> = []
  try {
    const parsed = extractJson(
      await generateParts(parts, {
        system: valSystem,
        json: true,
        maxOutputTokens: Math.min(2048, 320 + valid.length * 200),
        temperature: 0,
      }),
    ) as { results?: typeof results } | null
    results = parsed?.results ?? []
  } catch (_e) {
    results = []
  }

  valid.forEach((v, i) => {
    const p = v.p
    const r = results.find((x) => Number(x.index) === i + 1) ?? {}
    const label = (p.docType || 'pièce').toUpperCase()

    // ── LANGUE (RCP, Notice, Étiquette, Artwork) : signaler si ≠ langue officielle du pays.
    if (LANG_TYPES.has(p.docType)) {
      const lang = String(r.language ?? '')
        .toLowerCase()
        .slice(0, 2)
      if (lang && targetLang && lang !== targetLang) {
        findings.push({
          ...base(p),
          severity: 'warning',
          message: `${label} en ${langName(lang)} — langue cible : ${langName(targetLang)}. Traduction recommandée.`,
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

    if (expiry) {
      const m = monthsLeft(expiry, opDate)
      const how = derived ? ` (calculé : émission + ${months} mois)` : ''
      if (m < 0) {
        findings.push({ ...base(p), severity: 'error', message: `${label} expiré (${expiry})${how}.` })
      } else if (m < min) {
        findings.push({
          ...base(p),
          severity: 'warning',
          message: `${label} : validité restante ~${Math.floor(m)} mois (< ${min} requis${requirement} ; expire le ${expiry})${how}.`,
        })
      }
      // sinon valide (≥ seuil) → aucun constat
    } else if (r.found && r.validityStatement) {
      findings.push({
        ...base(p),
        severity: 'info',
        message: `${label} : validité énoncée « ${String(r.validityStatement).slice(0, 120)} » — date d'émission introuvable, à confirmer.`,
      })
    } else {
      findings.push({
        ...base(p),
        severity: 'warning',
        message: `${label} : aucune date ni durée de validité trouvée dans le document — à vérifier.`,
      })
    }
  })
  return findings
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
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
  if (authErr || !user) return json({ error: 'non authentifié' }, 401)

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
    agency?: string
    targetLang?: string
    letters?: LetterInput[]
    pieces?: PieceInput[]
  }
  const opDate = todayISO(b.operationDate)
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
    }))

  // Les deux analyses tournent EN PARALLÈLE (1 appel lettres + 1 appel batch validité).
  const [letterFindings, validityFindings] = await Promise.all([
    analyzeLetters(letters, {
      opDate,
      productName: b.productName,
      titulaire: b.titulaire,
      country: b.country,
      agency: b.agency,
    }),
    analyzeValidityBatch(supabase, pieces, opDate, b.agency ?? '', b.targetLang ?? ''),
  ])

  return json({ findings: [...letterFindings, ...validityFindings] })
})
