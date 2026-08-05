import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UpgradeApiError,
  demanderSource,
  demanderUrlDepot,
  franchirPorte,
  lireStatut,
  raisonDepuisHttp,
  PUT_ESSAIS,
  telechargerSource,
  televerserAvecReprises,
  televerserSource,
} from './upgrade-api'

const reponse = (status: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })

/**
 * Mock de `fetch` dont les PARAMÈTRES sont déclarés — sans eux, `mock.calls[0][1]` n'existe pas
 * pour TypeScript, et les assertions sur le corps envoyé ne compilent pas. Or c'est précisément ce
 * qu'on veut vérifier : ce que le client ENVOIE, pas seulement ce qu'il rend.
 */
const espionFetch = (reponses: (url: string, init: RequestInit) => Promise<Response>) =>
  vi.fn((url: string, init: RequestInit) => reponses(url, init))

const corpsEnvoye = (f: ReturnType<typeof espionFetch>): Record<string, unknown> =>
  JSON.parse(String(f.mock.calls[0]![1].body))

afterEach(() => vi.unstubAllGlobals())

describe('raisonDepuisHttp', () => {
  it('distingue le lien mort du refus — les deux sont des 4xx', () => {
    // ⚠️ Les confondre transformerait un refus GRATUIT et rattrapable (« ce n'est pas un RCP »)
    // en impression de panne payante, et un lien expiré en « réessayez » sans fin.
    expect(raisonDepuisHttp(404)).toBe('lien_invalide')
    expect(raisonDepuisHttp(410)).toBe('lien_invalide')
    expect(raisonDepuisHttp(400)).toBe('refus')
    expect(raisonDepuisHttp(409)).toBe('refus')
    expect(raisonDepuisHttp(413)).toBe('refus')
    expect(raisonDepuisHttp(429)).toBe('trop_de_requetes')
    expect(raisonDepuisHttp(500)).toBe('indisponible')
    expect(raisonDepuisHttp(503)).toBe('indisponible')
  })
})

describe('erreurs', () => {
  it('le message DESTINÉ AU CLIENT est conservé, pas écrasé par le code technique', () => {
    // La porte de recevabilité renvoie une phrase soignée qui dit que rien n'a été débité.
    // La perdre au profit d'un « 400 invalid_source » ferait ouvrir un litige.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reponse(400, { error: 'invalid_source', message: 'seuls les PDF sont acceptés' }),
      ),
    )
    return expect(demanderUrlDepot('t', 10)).rejects.toMatchObject({
      raison: 'refus',
      messageClient: 'seuls les PDF sont acceptés',
    })
  })

  it('une coupure réseau est « indisponible », donc réessayable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(lireStatut('t')).rejects.toBeInstanceOf(UpgradeApiError)
    await expect(lireStatut('t')).rejects.toMatchObject({ raison: 'indisponible' })
  })

  it('un 200 au corps ILLISIBLE n’est pas un succès', async () => {
    // Le traiter comme tel ferait avancer l'écran sur du vide — et, sur la porte, lancer un
    // traitement à 2 $ en croyant l'avoir déjà lancé.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 200 })),
    )
    await expect(lireStatut('t')).rejects.toMatchObject({ raison: 'indisponible' })
  })
})

describe('franchirPorte', () => {
  it('un REFUS revient normalement, il ne lève pas', async () => {
    // ⚠️ Le refus arrive en 200 avec `status: 'refused'`. Le traiter en exception afficherait un
    // écran de panne là où la commande est intacte et l'acheteur peut redéposer sans rien payer.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reponse(200, {
          status: 'refused',
          message: 'Ce fichier ne ressemble pas à un RCP…',
          depositsLeft: 2,
        }),
      ),
    )
    const r = await franchirPorte('t', 'j', 'texte', 'text')
    expect(r.status).toBe('refused')
    expect(r.depositsLeft).toBe(2)
  })

  it('transmet la provenance DÉCLARÉE par le navigateur', async () => {
    // Le serveur ne la devine pas : elle commande la tolérance du contrôle d'ancrage ET l'encart
    // « votre document est un scan » du rapport.
    const f = espionFetch(async () => reponse(200, { status: 'started' }))
    vi.stubGlobal('fetch', f)
    await franchirPorte('t', 'j', 'texte', 'ocr')
    const envoye = corpsEnvoye(f)
    expect(envoye.sourceKind).toBe('ocr')
    expect(envoye.jobId).toBe('j')
  })
})

describe('demanderUrlDepot', () => {
  it('le client ne nomme JAMAIS autre chose qu’un PDF', async () => {
    const f = espionFetch(async () =>
      reponse(200, { jobId: 'j', uploadUrl: 'u', uploadToken: 'k' }),
    )
    vi.stubGlobal('fetch', f)
    await demanderUrlDepot('t', 4096)
    const envoye = corpsEnvoye(f)
    expect(envoye.contentType).toBe('application/pdf')
    expect(envoye.docType).toBe('rcp')
    // Aucune clé Storage n'est proposée par le client : c'est le serveur qui la calcule.
    expect(envoye.path).toBeUndefined()
  })
})

describe('televerserSource', () => {
  it('écrase le dépôt précédent — sinon une coupure réseau coûte une tentative', async () => {
    // ⚠️ La clé est dérivée du job : un second essai réécrit la MÊME clé. Sans `x-upsert`, il
    // échouerait en 409 sur un job qui vient pourtant de consommer son dépôt, et l'acheteur en
    // perdrait un sur trois pour une coupure.
    const f = espionFetch(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', f)
    await televerserSource('https://storage/u', 'jeton', new Blob(['x']))
    const init = f.mock.calls[0]![1]
    const entetes = init.headers as Record<string, string>
    expect(entetes['x-upsert']).toBe('true')
    expect(entetes.authorization).toBe('Bearer jeton')
    expect(init.method).toBe('PUT')
  })

  it('un échec de téléversement est NOMMÉ, pas avalé', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 403 })),
    )
    await expect(televerserSource('u', 'k', new Blob(['x']))).rejects.toBeInstanceOf(
      UpgradeApiError,
    )
  })
})

describe('demanderSource / telechargerSource', () => {
  it('« pas de document déposé » est un REFUS (409), jamais un lien mort (404)', async () => {
    // ⚠️ Les deux sont des 4xx, et la page en tire deux écrans opposés : un 404 lui fait dire
    // « votre lien a expiré » — c'est-à-dire annoncer la mort de sa commande à quelqu'un qui a
    // simplement fermé l'onglet avant de téléverser.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponse(409, { error: 'no_source' })),
    )
    await expect(demanderSource('t'.repeat(43))).rejects.toMatchObject({ raison: 'refus' })
  })

  it('le jeton part dans le CORPS, jamais dans l’URL', async () => {
    const f = espionFetch(async () =>
      reponse(200, { jobId: 'j', docType: 'rcp', url: 'https://s/x', expiresIn: 600 }),
    )
    vi.stubGlobal('fetch', f)
    const r = await demanderSource('t'.repeat(43))
    expect(r.jobId).toBe('j')
    expect(String(f.mock.calls[0]![0])).not.toContain('t'.repeat(43))
    expect(corpsEnvoye(f).token).toBe('t'.repeat(43))
  })

  it('le téléchargement ne porte AUCUN en-tête d’autorisation', async () => {
    // La signature est DANS l'URL. Un en-tête `authorization` transformerait la requête en requête
    // « non simple » et déclencherait un contrôle préalable CORS que le stockage refuse.
    const f = espionFetch(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const buf = await telechargerSource('https://storage/signed')
    expect(buf.byteLength).toBe(3)
    expect(f.mock.calls[0]![1]?.headers).toBeUndefined()
  })

  it('une URL signée périmée est NOMMÉE, pas rendue comme un document vide', async () => {
    // Rendre un tampon vide ferait partir `prepareUpgradeSource` sur un PDF de zéro octet, et
    // l'acheteur lirait « nous n'avons pas réussi à lire ce PDF » à propos d'un fichier valide.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 400 })),
    )
    await expect(telechargerSource('https://storage/signed')).rejects.toBeInstanceOf(
      UpgradeApiError,
    )
  })
})

describe('televerserAvecReprises', () => {
  it('une coupure réseau ne coûte PAS un dépôt sur trois', async () => {
    // ⚠️ Réessayer le PUT ne consomme rien : la clé est dérivée du job et `x-upsert` autorise la
    // réécriture. C'est `order-upload-url` qui décompte, et il a déjà été appelé.
    let appels = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels += 1
        if (appels < 3) throw new TypeError('Failed to fetch')
        return new Response(null, { status: 200 })
      }),
    )
    await televerserAvecReprises('u', 'k', new Blob(['x']), async () => {})
    expect(appels).toBe(3)
  })

  it('un REFUS du serveur ne se réessaie pas — il refuserait à l’identique', async () => {
    // Une URL signée expirée retentée trois fois ne fait que rallonger l'attente d'un acheteur
    // qui a payé, pendant que l'écran prétend travailler.
    let appels = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels += 1
        return new Response(null, { status: 403 })
      }),
    )
    await expect(
      televerserAvecReprises('u', 'k', new Blob(['x']), async () => {}),
    ).rejects.toBeInstanceOf(UpgradeApiError)
    expect(appels).toBe(1)
  })

  it('les reprises sont BORNÉES', async () => {
    let appels = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels += 1
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(
      televerserAvecReprises('u', 'k', new Blob(['x']), async () => {}),
    ).rejects.toMatchObject({ raison: 'indisponible' })
    expect(appels).toBe(PUT_ESSAIS)
  })
})
