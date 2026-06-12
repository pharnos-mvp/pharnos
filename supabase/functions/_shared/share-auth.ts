// Authentification du lien de partage (jalon H) — symétrique de `web/src/features/
// correspondence/share-crypto.ts`. Le token (256 bits, base64url) est vérifié par lookup de son
// SHA-256 ; le mot de passe optionnel par PBKDF2-HMAC-SHA256 (format auto-descriptif
// `pbkdf2$<iter>$<salt b64url>$<hash b64url>`). WebCrypto natif, zéro dépendance.

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
/** Garde anti-DoS : itérations bornées (un hash forgé ne peut pas épuiser le CPU de l'Edge). */
const MAX_ITERATIONS = 1_000_000
const DEFAULT_ITERATIONS = 600_000
const KEY_BITS = 256

export const isValidShareToken = (token: unknown): token is string =>
  typeof token === 'string' && TOKEN_RE.test(token)

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer as ArrayBuffer, iterations },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** Hash de création (utilisé par les tests et une éventuelle rotation côté serveur). */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2Bits(password, salt, DEFAULT_ITERATIONS)
  return `pbkdf2$${DEFAULT_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

/** Comparaison à temps constant (pas de court-circuit sur le premier octet divergent). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Vérifie un mot de passe contre un hash sérialisé. Renvoie `false` (jamais d'exception) sur
 * hash malformé / itérations hors bornes : un enregistrement corrompu ne doit pas ouvrir l'accès.
 */
export async function verifySharePassword(password: string, serialized: string): Promise<boolean> {
  const parts = serialized.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > MAX_ITERATIONS) {
    return false
  }
  try {
    const salt = fromBase64Url(parts[2])
    const expected = fromBase64Url(parts[3])
    if (salt.length < 8 || expected.length !== KEY_BITS / 8) return false
    const actual = await pbkdf2Bits(password, salt, iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
