/**
 * Crypto du lien de partage (jalon H) — WebCrypto natif, zéro dépendance.
 *
 * Contrat (ADR-0003), symétrique avec l'Edge `share` (`_shared/share-auth.ts`) :
 *   • token : 256 bits aléatoires, encodé base64url (43 caractères) — porté par l'URL,
 *     stocké côté serveur UNIQUEMENT sous forme de SHA-256 hex (lookup par index unique).
 *   • mot de passe optionnel : PBKDF2-HMAC-SHA256, 600 000 itérations (OWASP), sel 16 o,
 *     sérialisé `pbkdf2$<iter>$<salt b64url>$<hash b64url>` — l'itération est lue depuis le
 *     hash à la vérification (agilité sans migration).
 */

const PBKDF2_ITERATIONS = 600_000
const PBKDF2_KEY_BITS = 256

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Token de partage : 256 bits d'entropie, URL-safe. */
export function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toBase64Url(bytes)
}

/** SHA-256 hex d'une chaîne UTF-8 (empreinte du token stockée en DB). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
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
    // Copie dans un ArrayBuffer « pur » : satisfait les typings stricts de lib.dom.
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer, iterations },
    key,
    PBKDF2_KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** Hash du mot de passe de partage, calculé à la création (côté expéditeur). */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2Bits(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

/** URL publique de review pour un token (origine de l'app courante). */
export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/r/${token}`
}
