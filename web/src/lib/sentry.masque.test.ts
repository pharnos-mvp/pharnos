import { describe, expect, it } from 'vitest'

import { masquerJetons } from './sentry'

const JETON = 'Ab3-_'.repeat(8) + 'xyz'

describe('masquerJetons', () => {
  it('un jeton de page publique ne part JAMAIS chez un tiers', () => {
    // ⚠️ Ces jetons SONT l'authentification, pour trente jours — sur `/u/`, celle d'une commande
    // payée et de ses trois dépôts. `browserTracingIntegration` nomme ses transactions d'après
    // l'URL : sans masquage, chaque transaction échantillonnée en publiait un.
    expect(JETON).toHaveLength(43)
    expect(masquerJetons(`https://app.pharnos.com/u/${JETON}`)).toBe(
      'https://app.pharnos.com/u/:token',
    )
    expect(masquerJetons(`/r/${JETON}`)).toBe('/r/:token')
    expect(masquerJetons(`/u/${JETON}/`)).toBe('/u/:token/')
  })

  it('ce qui n’est pas un jeton n’est pas touché', () => {
    for (const intact of ['/dossiers/42', '/u/court', '/admin', '', '/upgrade/rcp']) {
      expect(masquerJetons(intact)).toBe(intact)
    }
  })

  it('plusieurs occurrences dans un même texte sont toutes masquées', () => {
    // Un fil d'Ariane de navigation porte l'ancienne URL ET la nouvelle.
    const fil = `from /r/${JETON} to /u/${JETON}`
    expect(masquerJetons(fil)).toBe('from /r/:token to /u/:token')
  })
})
