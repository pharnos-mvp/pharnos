import { describe, expect, it } from 'vitest'

import { generateShareToken, hashSharePassword, sha256Hex, shareUrl } from './share-crypto'

describe('share-crypto (lien de partage)', () => {
  it('génère un token 256 bits base64url (43 caractères URL-safe), unique', () => {
    const a = generateShareToken()
    const b = generateShareToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('calcule un SHA-256 hex déterministe (vecteur connu)', async () => {
    // Vecteur NIST : sha256("abc")
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'))
  })

  it('hash PBKDF2 sérialisé pbkdf2$iter$salt$hash, sels uniques', async () => {
    const h1 = await hashSharePassword('s3cret')
    const h2 = await hashSharePassword('s3cret')
    const [scheme, iter, salt, hash] = h1.split('$')
    expect(scheme).toBe('pbkdf2')
    expect(Number(iter)).toBeGreaterThanOrEqual(600_000)
    expect(salt).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(h1).not.toBe(h2) // sel aléatoire
  }, 30_000)

  it('construit l’URL publique /r/{token} sans double slash', () => {
    expect(shareUrl('https://pharnos.pages.dev/', 'tok')).toBe('https://pharnos.pages.dev/r/tok')
    expect(shareUrl('http://localhost:5173', 'tok')).toBe('http://localhost:5173/r/tok')
  })
})
