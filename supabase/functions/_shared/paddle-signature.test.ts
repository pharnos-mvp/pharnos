// deno test — signature des webhooks Paddle. Module pur : aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import {
  FENETRE_SIGNATURE_S,
  lireSignaturePaddle,
  signaturePaddleValide,
} from './paddle-signature.ts'

const SECRET = 'pdl_ntfset_01example_secret_key_for_tests_only'
const TS = 1_770_000_000

/** Fabrique une signature VALIDE — le seul oracle honnête pour tester un vérificateur. */
async function signer(corps: Uint8Array, ts: number, secret = SECRET): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const prefixe = new TextEncoder().encode(`${ts}:`)
  const charge = new Uint8Array(prefixe.length + corps.length)
  charge.set(prefixe, 0)
  charge.set(corps, prefixe.length)
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, charge as BufferSource))
  const hex = Array.from(hmac).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `ts=${ts};h1=${hex}`
}

const octets = (s: string) => new TextEncoder().encode(s)

Deno.test('signature Paddle : un corps signé avec le bon secret PASSE', async () => {
  const corps = octets('{"event_type":"transaction.completed","data":{"id":"txn_1"}}')
  const entete = await signer(corps, TS)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS), true)
  // La fenêtre est symétrique : une horloge serveur en avance ne doit pas tout refuser.
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS - 120), true)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS + 120), true)
})

Deno.test('signature Paddle : mauvais secret, corps altéré, en-tête malformé — tous refusés', async () => {
  const corps = octets('{"event_type":"transaction.completed","data":{"id":"txn_1"}}')
  const entete = await signer(corps, TS)

  assertEquals(await signaturePaddleValide('pdl_ntfset_autre_secret_totalement', corps, entete, TS), false)
  // Un seul octet changé casse le condensat — c'est tout l'intérêt.
  assertEquals(await signaturePaddleValide(SECRET, octets('{"event_type":"transaction.completed","data":{"id":"txn_2"}}'), entete, TS), false)

  for (const mauvais of [
    '',
    'h1=' + 'a'.repeat(64),
    `ts=${TS}`,
    `ts=abc;h1=${'a'.repeat(64)}`,
    `ts=${TS};h1=pas-de-l-hexa`,
    `ts=${TS};h1=${'a'.repeat(63)}`,
    `ts=-1;h1=${'a'.repeat(64)}`,
    `sha256=${'a'.repeat(64)}`, // le format CHARIOW : deux contrats distincts, jamais confondus
  ]) {
    assertEquals(await signaturePaddleValide(SECRET, corps, mauvais, TS), false, `accepté : ${mauvais}`)
  }
})

Deno.test('⚠️ signature Paddle : hors de la fenêtre, un corps authentique est refusé', async () => {
  // Le rejeu d'un corps intercepté doit expirer. Mais la fenêtre est LARGE et le pourquoi compte :
  // les 5 s recommandées par Paddle visent un serveur chaud — sur Edge, un démarrage à froid les
  // dépasse et ferait perdre la naissance d'une commande PAYÉE.
  const corps = octets('{"event_type":"transaction.completed"}')
  const entete = await signer(corps, TS)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS + FENETRE_SIGNATURE_S), true)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS + FENETRE_SIGNATURE_S + 1), false)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS - FENETRE_SIGNATURE_S - 1), false)
})

Deno.test('⚠️ signature Paddle : l’horodatage entre DANS la charge — le déplacer invalide', async () => {
  // Le défaut qu'un vérificateur naïf laisse passer : signer le corps SEUL. Un attaquant pourrait
  // alors rejouer un corps authentique en changeant simplement `ts` pour rester dans la fenêtre.
  const corps = octets('{"event_type":"transaction.completed"}')
  const entete = await signer(corps, TS)
  const deplace = entete.replace(`ts=${TS}`, `ts=${TS + 60}`)
  assertEquals(await signaturePaddleValide(SECRET, corps, deplace, TS + 60), false)
})

Deno.test('signature Paddle : les octets BRUTS font foi, jamais le JSON re-sérialisé', async () => {
  // Même piège que chez Chariow : une barre échappée (`\/`) ou un accent en `\uXXXX` ne survit pas
  // à un `JSON.stringify` du corps parsé. On signe ce qui est reçu, octet pour octet.
  const brut = '{"url":"https:' + String.fromCharCode(0x5c) + '/' + String.fromCharCode(0x5c) +
    '/pharnos.com","nom":"' + String.fromCharCode(0x5c) + 'u00e9té"}'
  const corps = octets(brut)
  const entete = await signer(corps, TS)
  assertEquals(await signaturePaddleValide(SECRET, corps, entete, TS), true)
  // Re-sérialisé, le même objet produit d'autres octets — donc un autre condensat.
  const reserialise = octets(JSON.stringify(JSON.parse(brut)))
  assertEquals(await signaturePaddleValide(SECRET, reserialise, entete, TS), false)
})

Deno.test('lireSignaturePaddle : la lecture est tout ou rien', () => {
  const h = 'b'.repeat(64)
  assertEquals(lireSignaturePaddle(`ts=${TS};h1=${h}`), { ts: TS, h1: h })
  // L'ordre des composants n'est pas garanti par le contrat.
  assertEquals(lireSignaturePaddle(`h1=${h};ts=${TS}`), { ts: TS, h1: h })
  // La casse de l'hexadécimal ne doit pas décider d'un refus.
  assertEquals(lireSignaturePaddle(`ts=${TS};h1=${h.toUpperCase()}`), { ts: TS, h1: h })
  // Un composant manquant ne prouve rien : on ne rend pas de valeur partielle.
  assertEquals(lireSignaturePaddle(`ts=${TS}`), null)
  assertEquals(lireSignaturePaddle(`h1=${h}`), null)
  assertEquals(lireSignaturePaddle(''), null)
})
