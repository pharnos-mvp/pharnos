// Fournisseur LLM — Vertex AI (Gemini) derrière une abstraction simple.
// Auth : service account JWT (RS256, Web Crypto) -> access token OAuth -> :generateContent.
// Secrets (Supabase) : GCP_SA_KEY (base64 du JSON SA, ou JSON brut), GCP_PROJECT_ID,
// GCP_LOCATION (def. 'global'), GCP_MODEL (def. 'gemini-3.1-flash-lite').
//
// Confidentialité : Vertex no-train ; les secrets restent côté Edge (jamais exposés au client).

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
}

let cachedToken: { token: string; exp: number } | null = null

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get('GCP_SA_KEY')
  if (!raw) throw new Error('GCP_SA_KEY manquant')
  // Stocké en base64 (robustesse d'échappement) ; repli sur JSON brut.
  let json: string
  try {
    json = raw.trim().startsWith('{') ? raw : atob(raw)
  } catch {
    json = raw
  }
  return JSON.parse(json) as ServiceAccount
}

async function mintAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token

  const sa = loadServiceAccount()
  const enc = new TextEncoder()
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: sa.token_uri,
        iat: now,
        exp: now + 3600,
      }),
    ),
  )
  const input = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input)),
  )
  const jwt = `${input}.${b64url(sig)}`

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`)
  const data = await res.json()
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) }
  return cachedToken.token
}

function vertexUrl(method: string, modelOverride?: string): string {
  const project = Deno.env.get('GCP_PROJECT_ID')
  if (!project) throw new Error('GCP_PROJECT_ID manquant')
  const location = Deno.env.get('GCP_LOCATION') ?? 'global'
  // Modèle par défaut (flash-lite), surchargeable par appel (ex. validité → flash, plus précis).
  const model = modelOverride || Deno.env.get('GCP_MODEL') || 'gemini-3.1-flash-lite'
  const host =
    location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${method}`
}

export interface GenerateOptions {
  system?: string
  maxOutputTokens?: number
  temperature?: number
  /** Demande une sortie JSON stricte (Gemini responseMimeType). */
  json?: boolean
  /** Modèle Gemini pour CET appel (surcharge le défaut `GCP_MODEL`). Ex. validité → flash. */
  model?: string
}

/** Un fragment de contenu : texte ou donnée binaire inline (base64) — pour le multimodal. */
export interface Part {
  text?: string
  inlineData?: { mimeType: string; data: string }
}

/** Génère du texte via Gemini sur Vertex à partir de fragments (texte + documents/images). */
export async function generateParts(parts: Part[], opts: GenerateOptions = {}): Promise<string> {
  const token = await mintAccessToken()
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  }
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] }

  const res = await fetch(vertexUrl('generateContent', opts.model), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vertex ${res.status}: ${(await res.text()).slice(0, 400)}`)
  const data = await res.json()
  const out = data?.candidates?.[0]?.content?.parts ?? []
  return out.map((p: { text?: string }) => p.text ?? '').join('')
}

/** Génère du texte (non-streaming) via Gemini sur Vertex. */
export function generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  return generateParts([{ text: prompt }], opts)
}
