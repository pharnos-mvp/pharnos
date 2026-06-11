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
import { vertexSseToSimple } from '../_shared/sse.ts'
import { generateParts, streamParts, type Part } from '../_shared/vertex.ts'

const MAX_FILE_BYTES = 12 * 1024 * 1024
const MAX_TEXT_CHARS = 60_000
const STORAGE_BUCKET = 'documents'
const UPGRADE_TIMEOUT_MS = 180_000

/** Marqueur officiel des rubriques sans information source — contrat avec le client (compteur). */
export const MISSING_MARKER = '[NON FOURNI DANS LE DOCUMENT SOURCE]'

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
  const titulaire = (ctx.titulaire ?? '').trim()
  const fabricant = (ctx.fabricant ?? '').trim()
  if (titulaire) {
    lines.push(
      `- Titulaire de l'AMM (certifié) : ${titulaire}${ctx.titulaireAdresse ? ` — ${ctx.titulaireAdresse}` : ''}`,
    )
  }
  if (fabricant) {
    lines.push(
      `- Fabricant (certifié) : ${fabricant}${ctx.fabricantAdresse ? ` — ${ctx.fabricantAdresse}` : ''}`,
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
  const countryCode = b.countryCode
    ? String(b.countryCode).toUpperCase().slice(0, 2)
    : undefined

  // Source : pièce téléchargée (Storage, RLS via le JWT appelant) ou texte borné.
  let sourcePart: Part
  let sourceBytes = 0
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
    const text = String(b.text).slice(0, MAX_TEXT_CHARS)
    if (!text.trim()) return json({ error: 'texte source vide' }, 400)
    sourceBytes = text.length
    sourcePart = { text: `DOCUMENT SOURCE :\n${text}` }
  }

  const system = buildSystem(docType)
  const parts: Part[] = [
    { text: buildInstruction(spec.label, specPromptText(spec, countryCode), b.dossierContext) },
    sourcePart,
  ]

  const started = Date.now()
  logJson({
    ...log,
    op: 'start',
    docType,
    bytes: sourceBytes,
    fromText: !b.filePath,
    stream: b.stream === true,
  })

  // Mode STREAMING (opt-in) : le document conforme s'écrit au fil de l'eau (même UX que la
  // traduction) ; sans le flag, réponse JSON complète.
  if (b.stream === true) {
    try {
      const vertexRes = await streamParts(parts, {
        system,
        maxOutputTokens: 8192,
        temperature: 0,
        timeoutMs: UPGRADE_TIMEOUT_MS,
      })
      const out = vertexSseToSimple(vertexRes.body!, (chars) =>
        logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'ok', chars }),
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
      return json({ error: 'mise en conformité indisponible', detail: err }, 502)
    }
  }

  let text: string
  try {
    text = await generateParts(parts, {
      system,
      maxOutputTokens: 8192,
      temperature: 0,
      timeoutMs: UPGRADE_TIMEOUT_MS,
    })
  } catch (e) {
    const err = String((e as Error).message).slice(0, 300)
    logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'error', err })
    return json({ error: 'mise en conformité indisponible', detail: err }, 502)
  }
  if (!text.trim()) {
    logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'empty' })
    return json({ error: 'mise en conformité vide' }, 502)
  }

  logJson({ ...log, op: 'upgrade', ms: Date.now() - started, status: 'ok', chars: text.length })
  return json({ text, docType })
})
