// Signature des webhooks Paddle — module PUR, testable sans réseau.
//
// Contrat officiel (developer.paddle.com, « Signature verification ») :
//   • en-tête `Paddle-Signature: ts=<unix>;h1=<64 hexa>` — deux composants, point-virgule ;
//   • charge signée = `<ts>` + `:` + les OCTETS BRUTS du corps, sans la moindre transformation ;
//   • HMAC-SHA256, clé = la `endpoint_secret_key` de la destination (`pdl_ntfset_…`), telle quelle.
//
// ⚠️ CE N'EST PAS LE MÊME CONTRAT QUE CHARIOW, et c'est la raison d'un module séparé : Chariow
// signe le corps seul (`sha256=…`), Paddle signe l'horodatage AVEC le corps. Réutiliser le
// vérificateur de l'un pour l'autre produirait un refus systématique — ou pire, une vérification
// qui passe sur un corps rejouable.
import { egalConstant } from './pulse-signature.ts'

/**
 * Fenêtre d'acceptation de l'horodatage.
 *
 * ⚠️ Paddle recommande 5 SECONDES, et c'est un chiffre pensé pour un serveur toujours chaud. Sur
 * une Edge Function, un démarrage à froid dépasse régulièrement ce délai : appliquer 5 s ferait
 * REFUSER des webhooks légitimes, c'est-à-dire perdre la naissance d'une commande PAYÉE — le coût
 * exact que ce chantier passe son temps à fermer. On retient 5 minutes, la valeur que Stripe
 * recommande pour le même usage.
 *
 * Ce que l'on ne perd pas en élargissant : la protection contre le rejeu ne repose PAS sur cette
 * fenêtre. Elle repose sur `orders.chariow_sale_id UNIQUE` — rejouer un webhook authentique ne
 * crée rien deux fois. L'horodatage borne la durée pendant laquelle un corps intercepté reste
 * utilisable ; l'idempotence, elle, rend le rejeu sans effet.
 */
export const FENETRE_SIGNATURE_S = 300

export interface SignaturePaddle {
  ts: number
  h1: string
}

/**
 * Lit l'en-tête `Paddle-Signature`. Rend `null` sur toute forme inattendue — jamais une valeur
 * partielle : un horodatage sans signature, ou l'inverse, ne prouve rien.
 */
export function lireSignaturePaddle(entete: string): SignaturePaddle | null {
  let ts: number | null = null
  let h1: string | null = null
  for (const morceau of entete.split(';')) {
    const [cle, valeur] = morceau.split('=', 2)
    if (!cle || valeur === undefined) continue
    if (cle.trim() === 'ts') {
      const n = Number(valeur.trim())
      // Un horodatage non entier ou négatif n'est pas une date : on refuse plutôt que de calculer
      // un écart absurde qui tomberait dans la fenêtre par accident.
      if (Number.isInteger(n) && n > 0) ts = n
    } else if (cle.trim() === 'h1') {
      const v = valeur.trim().toLowerCase()
      if (/^[0-9a-f]{64}$/.test(v)) h1 = v
    }
  }
  return ts !== null && h1 !== null ? { ts, h1 } : null
}

/**
 * Vérifie la signature d'un webhook Paddle sur les octets bruts du corps.
 *
 * `maintenantS` est INJECTÉ : sans horloge injectable, la fenêtre temporelle ne se teste qu'en
 * espérant que la machine soit assez rapide — c'est-à-dire pas du tout.
 */
export async function signaturePaddleValide(
  secret: string,
  corps: Uint8Array,
  entete: string,
  maintenantS: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const sig = lireSignaturePaddle(entete)
  if (!sig) return false
  // La fenêtre se juge en VALEUR ABSOLUE : une horloge serveur en avance produirait un écart
  // négatif, et ne le voir que dans un sens laisserait passer des corps arbitrairement anciens.
  if (Math.abs(maintenantS - sig.ts) > FENETRE_SIGNATURE_S) return false

  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  // `<ts>:<corps brut>` — concaténé sur les OCTETS, jamais sur une chaîne décodée : décoder puis
  // ré-encoder introduirait la normalisation UTF-8, seule classe d'écart que le contrat interdit.
  const prefixe = new TextEncoder().encode(`${sig.ts}:`)
  const charge = new Uint8Array(prefixe.length + corps.length)
  charge.set(prefixe, 0)
  charge.set(corps, prefixe.length)

  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, charge as BufferSource))
  const attendue = Array.from(hmac).map((b) => b.toString(16).padStart(2, '0')).join('')
  return egalConstant(sig.h1, attendue)
}
