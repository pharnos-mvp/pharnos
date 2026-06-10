// Edge Function `translate` (M5) — traduction professionnelle d'un document réglementaire vers la
// langue cible, terminologie médicale standardisée (MedDRA). Multimodal : Gemini LIT le PDF/scan.
// Assistif (human-in-the-loop) : la traduction est proposée pour revue, jamais finale.
// Contrat sécurité (ADR 0002) : JWT Supabase vérifié, Storage via le JWT appelant (RLS), no-train.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { generateParts, type Part } from '../_shared/vertex.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_FILE_BYTES = 12 * 1024 * 1024
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
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
  if (authErr || !user) return json({ error: 'non authentifié' }, 401)

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

  let text: string
  try {
    text = await generateParts(parts, { system, maxOutputTokens: 8192, temperature: 0.1 })
  } catch (e) {
    return json({ error: 'traduction indisponible', detail: String((e as Error).message).slice(0, 300) }, 502)
  }
  if (!text.trim()) return json({ error: 'traduction vide' }, 502)

  return json({ text, targetLang: b.targetLang || 'fr' })
})
