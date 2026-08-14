// Signature des Pulses Chariow (LOT C3) — module PUR, testable sans réseau.
//
// Contrat complet (chariow.dev, « Pulse Security ») :
//   • en-tête `x-chariow-signature: sha256=<64 hexa minuscules>` ;
//   • HMAC-SHA256 des octets BRUTS du corps, exactement tels que reçus ;
//   • clé = le secret `whsec_…` du Pulse, TEL QUEL — jamais décodé, jamais dérivé ;
//   • pas d'horodatage, par conception : la protection anti-rejeu vit ailleurs (chez nous,
//     l'idempotence par `orders.chariow_sale_id UNIQUE` et la re-vérification).
//
// ⚠️ Jamais re-sérialiser le JSON pour signer : Chariow échappe les barres (`\/`) et les
// non-ASCII (`\uXXXX`) — un `JSON.stringify` du corps parsé ne reproduit pas ces octets.

/** Comparaison en TEMPS CONSTANT — sur des chaînes de même longueur, sinon `false` sans juger. */
export function egalConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Vérifie `x-chariow-signature` sur les octets bruts du corps.
 *
 * Toute valeur qui ne commence pas par `sha256=` est un schéma non supporté : refusée — le
 * préfixe existe pour que le contrat puisse évoluer sans casser les receveurs.
 */
export async function signaturePulseValide(
  secret: string,
  corps: Uint8Array,
  recue: string,
): Promise<boolean> {
  if (!recue.startsWith('sha256=')) return false
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, corps as BufferSource))
  const attendue = 'sha256=' + Array.from(hmac).map((b) => b.toString(16).padStart(2, '0')).join('')
  return egalConstant(recue, attendue)
}
