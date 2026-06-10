// Edge Function `regafy-ai` — enrichit Regafy par une analyse IA (assistive only, human-in-the-loop).
// Contrat sécurité (ADR 0002) : vérif JWT Supabase + validation/bornes d'entrée + secrets GCP
// côté Edge uniquement. Renvoie des findings au MÊME modèle que le Regafy déterministe du front.
import { createClient } from 'npm:@supabase/supabase-js@2'

import { generateText } from '../_shared/vertex.ts'

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

const MAX_LETTERS = 8
const MAX_TEXT = 8000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'méthode non autorisée' }, 405)

  // 1) Auth — vérifier le JWT Supabase de l'appelant (sinon 401).
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

  // 2) Validation + bornes anti-abus.
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'JSON invalide' }, 400)
  }
  const b = (raw ?? {}) as {
    productName?: string
    titulaire?: string
    country?: string
    agency?: string
    letters?: LetterInput[]
  }
  if (!Array.isArray(b.letters) || b.letters.length === 0) {
    return json({ error: 'Champ "letters" requis (≥ 1).' }, 400)
  }
  const letters = b.letters.slice(0, MAX_LETTERS).map((l) => ({
    nodeNumber: String(l?.nodeNumber ?? ''),
    nodeLabel: String(l?.nodeLabel ?? ''),
    title: String(l?.title ?? '').slice(0, 200),
    text: String(l?.text ?? '').slice(0, MAX_TEXT),
  }))

  // 3) Prompt — expert RA UEMOA/CEDEAO, sortie JSON stricte.
  const system =
    "Tu es un expert en affaires réglementaires pharmaceutiques (UEMOA/CEDEAO). Tu analyses des " +
    "lettres administratives d'un dossier CTD Module 1 et tu repères les non-conformités ou " +
    'incohérences : formule d\'appel/politesse manquante ou inadaptée, destinataire/agence ' +
    'incohérents avec le pays, champs entre crochets non remplis, dates incohérentes, titulaire ' +
    'absent, ton inapproprié. Assistance uniquement : tes constats sont des suggestions, jamais ' +
    'des décisions finales. Tu écris en français, des messages courts et actionnables.'

  const prompt =
    `Contexte — Produit : ${b.productName ?? '(non précisé)'} | Titulaire : ${b.titulaire ?? '(non précisé)'} | ` +
    `Pays : ${b.country ?? '(non précisé)'} | Agence : ${b.agency ?? '(non précisée)'}.\n\n` +
    'Analyse les lettres ci-dessous et renvoie UNIQUEMENT un JSON de la forme :\n' +
    '{"findings":[{"nodeNumber":"<numéro CTD ou \'\'>","severity":"error|warning|info","message":"<constat court>"}]}\n' +
    "N'invente pas de problème : si une lettre est conforme, ne crée aucun finding pour elle. " +
    'Maximum 10 findings.\n\nLettres :\n' +
    letters
      .map((l, i) => `[#${i + 1} | nœud ${l.nodeNumber} | ${l.title}]\n${l.text}`)
      .join('\n\n---\n\n')

  // 4) Appel Vertex (Gemini, JSON mode).
  let out: string
  try {
    out = await generateText(prompt, {
      system,
      json: true,
      maxOutputTokens: 1024,
      temperature: 0.2,
    })
  } catch (e) {
    return json({ error: 'IA indisponible', detail: String((e as Error).message).slice(0, 300) }, 502)
  }

  // 5) Parse robuste -> findings normalisés.
  let parsedFindings: Array<{ nodeNumber?: string; severity?: string; message?: string }> = []
  try {
    const parsed = JSON.parse(out)
    parsedFindings = Array.isArray(parsed) ? parsed : (parsed.findings ?? [])
  } catch {
    const m = out.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        parsedFindings = JSON.parse(m[0]).findings ?? []
      } catch {
        parsedFindings = []
      }
    }
  }

  const sev = (s: unknown): 'error' | 'warning' | 'info' =>
    s === 'error' || s === 'warning' ? s : 'info'
  const findings = parsedFindings
    .slice(0, 10)
    .map((f) => {
      const nodeNumber = String(f?.nodeNumber ?? '')
      const node = letters.find((l) => l.nodeNumber === nodeNumber)
      return {
        nodeNumber,
        nodeLabel: node?.nodeLabel ?? '',
        severity: sev(f?.severity),
        message: String(f?.message ?? '').slice(0, 400),
      }
    })
    .filter((f) => f.message.trim().length > 0)

  return json({ findings })
})
