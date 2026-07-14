import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { installChunkReloadHandler } from '@/lib/chunk-reload'
import { reportError } from '@/lib/sentry'

vi.mock('@/lib/sentry', () => ({ reportError: vi.fn() }))

const KEY = 'pharnos.chunkReloadAt'

/** Événement Vite réel : `cancelable` (sinon preventDefault est inopérant) + `payload`. */
function emitPreloadError(): Event {
  const event = new Event('vite:preloadError', { cancelable: true }) as Event & { payload: Error }
  event.payload = new Error(
    'Failed to fetch dynamically imported module: https://app.pharnos.com/assets/ProductCockpit-DGy32Kyl.js',
  )
  window.dispatchEvent(event)
  return event
}

let uninstall: () => void = () => {}
let reload: Mock<() => void>

beforeEach(() => {
  sessionStorage.clear()
  vi.clearAllMocks()
  reload = vi.fn<() => void>()
  uninstall = installChunkReloadHandler(reload)
})

afterEach(() => {
  uninstall()
  vi.unstubAllGlobals()
})

describe('installChunkReloadHandler — chunk lazy périmé après déploiement', () => {
  it('recharge UNE fois et neutralise l’erreur (récupération silencieuse, pas de bruit Sentry)', () => {
    const event = emitPreloadError()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    // L'échec est ATTENDU après un déploiement et il est réparé : ne pas polluer Sentry.
    expect(reportError).not.toHaveBeenCalled()
  })

  it('ne reboucle PAS si l’échec persiste juste après le rechargement — et le remonte à Sentry', () => {
    emitPreloadError() // 1er échec → rechargement
    const second = emitPreloadError() // rejoué aussitôt : le rechargement n'a rien réparé

    expect(reload).toHaveBeenCalledTimes(1)
    // L'erreur suit son cours (pas de neutralisation) et devient visible…
    expect(second.defaultPrevented).toBe(false)
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('dynamically imported module') }),
      expect.objectContaining({ op: 'preload', recovered: false }),
    )
  })

  it('recharge de nouveau lors d’un déploiement ULTÉRIEUR (la garde expire, elle ne fige pas la session)', () => {
    emitPreloadError()
    expect(reload).toHaveBeenCalledTimes(1)

    // Nouveau déploiement plus tard dans la même session : la fenêtre anti-boucle est passée.
    sessionStorage.setItem(KEY, String(Date.now() - 60_000))
    emitPreloadError()

    expect(reload).toHaveBeenCalledTimes(2)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('stockage de session indisponible : ne recharge PAS (anti-boucle infinie) et remonte', () => {
    // Navigateur en mode privé strict / stockage refusé : sans garde persistante, un rechargement
    // pourrait boucler à l'infini sur l'utilisateur — on préfère l'erreur visible à la boucle.
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
    })

    emitPreloadError()

    expect(reload).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recovered: false }),
    )
  })

  it('désinstallé : l’écouteur ne réagit plus', () => {
    uninstall()

    emitPreloadError()

    expect(reload).not.toHaveBeenCalled()
  })
})
