import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  UpgradeApiError,
  demanderUrlDepot,
  franchirPorte,
  lireStatut,
  raisonDepuisHttp,
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
