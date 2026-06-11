// Edge Function `translate` (M5) — traduction professionnelle d'un document réglementaire vers la
// langue cible, terminologie médicale standardisée (MedDRA). Multimodal : Gemini LIT le PDF/scan.
// Assistif (human-in-the-loop) : la traduction est proposée pour revue, jamais finale.
// Contrat sécurité (ADR 0002) : JWT Supabase vérifié, Storage via le JWT appelant (RLS), no-train.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { corsHeaders, isAllowedOrigin } from '../_shared/cors.ts'
import { logJson, newReqId, userHash } from '../_shared/log.ts'
import { vertexSseToSimple } from '../_shared/sse.ts'
import { generateParts, streamParts, type Part } from '../_shared/vertex.ts'

const MAX_FILE_BYTES = 12 * 1024 * 1024
// Traduction multimodale d'un PDF complet : l'appel Vertex le plus long de l'app.
const TRANSLATE_TIMEOUT_MS = 90_000
const STORAGE_BUCKET = 'documents'
const LANG_NAMES: Record<string, string> = {
  fr: 'français',
  en: 'anglais',
  pt: 'portugais',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  ar: 'arabe',
}

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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const reqId = newReqId()
  if (!isAllowedOrigin(origin)) {
    logJson({ fn: 'translate', reqId, op: 'cors', status: 'forbidden' })
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
    logJson({ fn: 'translate', reqId, op: 'auth', status: 'unauthorized' })
    return json({ error: 'non authentifié' }, 401)
  }
  const log = { fn: 'translate', reqId, user: await userHash(user.id) }

  // Entrée.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const b = (raw ?? {}) as {
    filePath?: string
    fileName?: string
    docType?: string
    targetLang?: string
    /** true → réponse SSE au fil de l'eau ; absent → JSON (compat front antérieur). */
    stream?: boolean
  }
  if (!b.filePath) return json({ error: 'filePath requis' }, 400)
  const targetName = LANG_NAMES[(b.targetLang || 'fr').toLowerCase().slice(0, 2)] ?? 'français'
  const docType = String(b.docType ?? 'document')

  // Téléchargement du document (Storage, RLS via le JWT appelant).
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(b.filePath)
  if (error || !data) return json({ error: 'document introuvable' }, 404)
  const buf = new Uint8Array(await data.arrayBuffer())
  if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
    return json({ error: 'document illisible ou trop volumineux' }, 422)
  }

  const system =
    'Tu es un traducteur professionnel spécialisé en affaires réglementaires pharmaceutiques ' +
    `(UEMOA/CEDEAO). Tu traduis fidèlement le document vers le ${targetName}, en utilisant la ` +
    'terminologie médicale STANDARDISÉE MedDRA pour les termes médicaux (effets indésirables, ' +
    'pathologies, classes d\'organes…). Conserve la structure (titres, sections, listes, tableaux ' +
    'rendus en texte). Traduis INTÉGRALEMENT : ne résume pas, ne commente pas, n\'ajoute rien.'
  const parts: Part[] = [
    {
      text:
        `Traduis ce document (${docType}) en ${targetName}. Rends UNIQUEMENT la traduction, ` +
        'en texte structuré (titres puis paragraphes, une ligne vide entre les blocs).',
    },
    { inlineData: { mimeType: mimeFor(b.fileName ?? 'document'), data: bytesToBase64(buf) } },
  ]

  const started = Date.now()
  logJson({
    ...log,
    op: 'start',
    bytes: buf.byteLength,
    docType,
    target: b.targetLang || 'fr',
    stream: b.stream === true,
  })

  // Mode STREAMING (opt-in par le client) : SSE simple `data: {"text":"…"}` puis `data: [DONE]`.
  // Premier texte à l'écran en ~2 s au lieu d'attendre la traduction complète — terrain bas débit.
  if (b.stream === true) {
    try {
      const vertexRes = await streamParts(parts, {
        system,
        maxOutputTokens: 8192,
        temperature: 0.1,
        timeoutMs: 180_000,
      })
      const out = vertexSseToSimple(vertexRes.body!, (chars) =>
        logJson({ ...log, op: 'translate', ms: Date.now() - started, status: 'ok', chars }),
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
      logJson({ ...log, op: 'translate', ms: Date.now() - started, status: 'error', err })
      return json({ error: 'traduction indisponible', detail: err }, 502)
    }
  }

  let text: string
  try {
    text = await generateParts(parts, {
      system,
      maxOutputTokens: 8192,
      temperature: 0.1,
      timeoutMs: TRANSLATE_TIMEOUT_MS,
    })
  } catch (e) {
    const err = String((e as Error).message).slice(0, 300)
    logJson({ ...log, op: 'translate', ms: Date.now() - started, status: 'error', err })
    return json({ error: 'traduction indisponible', detail: err }, 502)
  }
  if (!text.trim()) {
    logJson({ ...log, op: 'translate', ms: Date.now() - started, status: 'empty' })
    return json({ error: 'traduction vide' }, 502)
  }

  logJson({ ...log, op: 'translate', ms: Date.now() - started, status: 'ok', chars: text.length })
  return json({ text, targetLang: b.targetLang || 'fr' })
})
