// deno test — signature des Pulses Chariow (C3). Module pur : aucun réseau.
import { assertEquals } from 'jsr:@std/assert@1'

import { egalConstant, signaturePulseValide } from './pulse-signature.ts'

const enc = new TextEncoder()

/** Signe comme Chariow : HMAC-SHA256 des octets, clé = le secret tel quel. */
async function signer(secret: string, corps: Uint8Array): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', cle, corps as BufferSource))
  return 'sha256=' + Array.from(h).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.test('signature : un corps signé avec le bon secret PASSE, tel quel', async () => {
  const secret = 'whsec_test_0123456789abcdef'
  // Le corps réel de Chariow : barres échappées, compact — signé OCTET par octet.
  const corps = enc.encode('{"event":"successful.sale","sale_id":"SALEX5MD9EZOYKITEPM","url":"https:\/\/x.com"}')
  assertEquals(await signaturePulseValide(secret, corps, await signer(secret, corps)), true)
})

Deno.test('signature : mauvais secret, corps altéré, schéma inconnu — tous REFUSÉS', async () => {
  const secret = 'whsec_test_0123456789abcdef'
  const corps = enc.encode('{"event":"successful.sale","sale_id":"SALE1"}')
  const bonne = await signer(secret, corps)
  // Mauvais secret (la clé API à la place du whsec — le piège n°1 du contrat).
  assertEquals(await signaturePulseValide('sk_live_autre_chose', corps, bonne), false)
  // Corps altéré d'un seul octet.
  const altere = enc.encode('{"event":"successful.sale","sale_id":"SALE2"}')
  assertEquals(await signaturePulseValide(secret, altere, bonne), false)
  // Schéma non supporté : refusé sans juger.
  assertEquals(await signaturePulseValide(secret, corps, 'sha512=' + bonne.slice(7)), false)
  // Vide.
  assertEquals(await signaturePulseValide(secret, corps, ''), false)
})

Deno.test('signature : re-sérialiser le JSON aurait cassé le condensat — les octets font foi', async () => {
  // Chariow échappe les barres : « https:\/\/x.com ». Un JSON.stringify du corps parsé rendrait
  // « https://x.com » — condensat différent. Ce test verrouille que la vérification porte sur les
  // octets et échouerait sur la version re-sérialisée.
  const secret = 'whsec_abc'
  // Le corps TEL QUE CHARIOW L'ÉMET : barres échappées (`\/`) — construit char par char pour
  // qu'aucun outil (heredoc, formateur) ne puisse « corriger » l'échappement en le copiant.
  const barre = String.fromCharCode(0x5c) + '/'
  const brut = `{"url":"https:${barre}${barre}example.com"}`
  const reserialise = JSON.stringify(JSON.parse(brut))
  const sig = await signer(secret, enc.encode(brut))
  assertEquals(await signaturePulseValide(secret, enc.encode(brut), sig), true)
  assertEquals(reserialise === brut, false)
  assertEquals(await signaturePulseValide(secret, enc.encode(reserialise), sig), false)
})

Deno.test('egalConstant : égalité stricte, longueurs différentes refusées sans lever', () => {
  assertEquals(egalConstant('abc', 'abc'), true)
  assertEquals(egalConstant('abc', 'abd'), false)
  assertEquals(egalConstant('abc', 'ab'), false)
  assertEquals(egalConstant('', ''), true)
})
