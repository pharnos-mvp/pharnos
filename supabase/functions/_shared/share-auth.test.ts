import { assert, assertEquals } from 'jsr:@std/assert@1'

import {
  hashSharePassword,
  isValidShareToken,
  sha256Hex,
  verifySharePassword,
} from './share-auth.ts'

Deno.test('isValidShareToken : format strict 43 caractères base64url', () => {
  assert(isValidShareToken('A'.repeat(43)))
  assert(isValidShareToken('aZ9_-'.repeat(8) + 'aZ9'))
  assert(!isValidShareToken('A'.repeat(42)))
  assert(!isValidShareToken('A'.repeat(44)))
  assert(!isValidShareToken('é' + 'A'.repeat(42)))
  assert(!isValidShareToken(null))
  assert(!isValidShareToken(42))
})

Deno.test('sha256Hex : vecteur NIST', async () => {
  assertEquals(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})

Deno.test('verifySharePassword : accepte le bon mot de passe, refuse le mauvais', async () => {
  const hash = await hashSharePassword('s3cret-pass')
  assert(await verifySharePassword('s3cret-pass', hash))
  assert(!(await verifySharePassword('S3cret-pass', hash)))
  assert(!(await verifySharePassword('', hash)))
})

Deno.test('verifySharePassword : hash malformé / hostile → false, jamais d’exception', async () => {
  assert(!(await verifySharePassword('x', '')))
  assert(!(await verifySharePassword('x', 'pbkdf2$abc$s$h')))
  assert(!(await verifySharePassword('x', 'bcrypt$600000$s$h')))
  // Itérations hors bornes (anti-DoS) : refusé sans calcul.
  assert(!(await verifySharePassword('x', 'pbkdf2$99999999$AAAAAAAAAAAAAAAAAAAAAA$AAAA')))
  assert(!(await verifySharePassword('x', 'pbkdf2$600000$%%%$@@@')))
})

Deno.test('compatibilité format web : pbkdf2$iter$salt$hash round-trip', async () => {
  const hash = await hashSharePassword('uemoa-cedeao')
  const [scheme, iter] = hash.split('$')
  assertEquals(scheme, 'pbkdf2')
  assertEquals(Number(iter), 600_000)
  assert(await verifySharePassword('uemoa-cedeao', hash))
})
