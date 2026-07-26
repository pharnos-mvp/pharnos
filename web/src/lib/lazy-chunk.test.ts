import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { loadChunk } from '@/lib/lazy-chunk'
import { reportError } from '@/lib/sentry'

vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const KEY = 'pharnos.chunkReloadAt'
const Page = () => null

let reload: Mock<() => void>
/** Tests rapides : pas d'attente réelle entre les tentatives, fenêtre de grâce courte. */
const opts = () => ({ reload, retryDelayMs: 0, reloadGraceMs: 20 })

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  reload = vi.fn<() => void>()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadChunk — chargement résilient des chunks de code-splitting', () => {
  it('succès direct : ni nouvelle tentative, ni rechargement, ni bruit Sentry', async () => {
    const factory = vi.fn(async () => ({ default: Page }))

    await expect(loadChunk(factory, opts())).resolves.toEqual({ default: Page })

    expect(factory).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('échec transitoire : la 2ᵉ tentative répare SANS recharger (lien instable, saisie préservée)', async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module: /assets/x.js'))
      .mockResolvedValueOnce({ default: Page })

    await expect(loadChunk(factory, opts())).resolves.toEqual({ default: Page })

    expect(factory).toHaveBeenCalledTimes(2)
    // Recharger ferait perdre la page ET la saisie en cours : c'est le dernier recours, pas le 1er.
    expect(reload).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('RÉGRESSION : un module résolu à `undefined` ne remonte JAMAIS jusqu’à React', async () => {
    // La panne de juillet 2026 : `preventDefault()` sur `vite:preloadError` faisait résoudre
    // l'import avec `undefined`, et `React.lazy` lisait `undefined.default` → écran mort.
    const factory = vi.fn(async () => undefined as unknown as { default: typeof Page })

    const settled = await Promise.race([
      loadChunk(factory, opts()).then(
        (value) => ({ kind: 'resolved' as const, value }),
        (error: Error) => ({ kind: 'rejected' as const, error }),
      ),
    ])

    // Quoi qu'il arrive, on ne résout pas `undefined` : ici le rechargement est autorisé, donc la
    // promesse ne tient que sur la fenêtre de grâce, puis rejette.
    expect(settled.kind).toBe('rejected')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('échec persistant : recharge UNE fois et reste en attente (pas d’écran d’erreur clignotant)', async () => {
    const factory = vi.fn(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js')
    })

    const promise = loadChunk(factory, opts())
    const outcome = await Promise.race([
      promise.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<string>((r) => setTimeout(() => r('en attente'), 5)),
    ])

    // Tant que la page part, la promesse ne tient pas : Suspense garde son loader.
    expect(outcome).toBe('en attente')
    expect(reload).toHaveBeenCalledTimes(1)
    // Après la fenêtre de grâce (le rechargement n'a pas eu lieu), on rend la main.
    await expect(promise).rejects.toThrow(/dynamically imported module/)
  })

  it('déjà rechargé à l’instant : ne reboucle PAS, rejette et remonte à Sentry', async () => {
    sessionStorage.setItem(KEY, String(Date.now()))
    const factory = vi.fn(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js')
    })

    await expect(loadChunk(factory, opts())).rejects.toThrow(/dynamically imported module/)

    expect(reload).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('dynamically imported module') }),
      expect.objectContaining({ op: 'chunk', recovered: false }),
    )
  })

  it('stockage de session refusé : pas de rechargement (anti-boucle infinie), erreur visible', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    const factory = vi.fn(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js')
    })

    await expect(loadChunk(factory, opts())).rejects.toThrow()

    expect(reload).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recovered: false }),
    )
  })

  it('un rejet non-`Error` devient un `Error` lisible (l’écran de repli affiche `message`)', async () => {
    sessionStorage.setItem(KEY, String(Date.now()))
    const factory = vi.fn(async () => {
      throw 'boom'
    })

    await expect(loadChunk(factory, opts())).rejects.toBeInstanceOf(Error)
  })

  it('une nouvelle tentative plus tard dans la session est permise (la garde expire)', async () => {
    sessionStorage.setItem(KEY, String(Date.now() - 60_000))
    const factory = vi.fn(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js')
    })

    void loadChunk(factory, opts()).catch(() => {})
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })
})
