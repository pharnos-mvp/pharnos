/**
 * L'écran d'après-paiement, testé là où il coûte de l'argent.
 *
 * Ce fichier ne teste pas du rendu : il teste des SITUATIONS dans lesquelles un acheteur qui a payé
 * 19 000 F se retrouve, et où la mauvaise réaction de l'écran lui coûte soit un dépôt sur trois,
 * soit sa commande. `vueDepuis` couvre les transitions pures ; ici, c'est l'orchestration — l'ordre
 * des appels, ce qui est consommé, et ce que l'acheteur lit.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'

const api = vi.hoisted(() => ({
  lireStatut: vi.fn(),
  demanderSource: vi.fn(),
  telechargerSource: vi.fn(),
  demanderUrlDepot: vi.fn(),
  televerserAvecReprises: vi.fn(),
  franchirPorte: vi.fn(),
}))
const ocr = vi.hoisted(() => ({ prepareUpgradeSource: vi.fn() }))

vi.mock('./upgrade-api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./upgrade-api')>()
  return { ...mod, ...api }
})
vi.mock('@/lib/ocr/prepare-source', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/ocr/prepare-source')>()
  return { ...mod, ...ocr }
})

const { PublicUpgradePage } = await import('./PublicUpgradePage')
const { UpgradeApiError } = await import('./upgrade-api')

const JETON = 'a'.repeat(43)

const statut = (o: Record<string, unknown> = {}) => ({
  statut: 'paid',
  phase: 'conformity',
  faites: 0,
  total: 0,
  echecs: 0,
  pret: false,
  depositsLeft: 3,
  expireLe: '2026-09-03T10:00:00.000Z',
  docType: 'rcp',
  ...o,
})

const rendre = () =>
  render(
    <I18nProvider>
      <PublicUpgradePage token={JETON} />
    </I18nProvider>,
  )

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  ocr.prepareUpgradeSource.mockReset()
  // Par défaut : aucun document déposé — l'acheteur a fermé l'onglet avant le téléversement.
  api.demanderSource.mockRejectedValue(new UpgradeApiError('refus', 'order-source : 409 no_source'))
})
afterEach(() => vi.clearAllMocks())

/* ─────────────────────────── Ce qui distingue une panne d'un lien mort ─────────────────────── */

describe('accès à la commande', () => {
  it('un lien inconnu annonce l’expiration', async () => {
    api.lireStatut.mockRejectedValue(new UpgradeApiError('lien_invalide', 'order-status : 404'))
    rendre()
    expect(await screen.findByText(/n’est plus valable/)).toBeInTheDocument()
  })

  it('⚠️ une COUPURE réseau n’annonce PAS l’expiration', async () => {
    // Le défaut que ce test ferme : `rafraichir` rendait `null` sur toute erreur, et `vueDepuis(null)`
    // vaut « expiré ». Une coupure 3G, un 503, ou un 429 — `order-status` compte par IP et les
    // opérateurs de la région partagent les leurs — annonçaient donc à quelqu'un qui venait de
    // payer que sa commande n'existait plus.
    api.lireStatut.mockRejectedValue(new UpgradeApiError('indisponible', 'injoignable'))
    rendre()
    expect(await screen.findByText(/Connexion perdue/)).toBeInTheDocument()
    expect(screen.queryByText(/n’est plus valable/)).not.toBeInTheDocument()
    // Et il existe une sortie : sans bouton, la page n'offrait AUCUN moyen de reprendre.
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
  })
})

/* ──────────────────────────── Ce qui consomme un dépôt, et dans quel ordre ─────────────────── */

describe('dépôt d’un document', () => {
  const choisir = async (fichier: File) => {
    const champ = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(champ, 'files', { value: [fichier], configurable: true })
    champ.dispatchEvent(new Event('change', { bubbles: true }))
    return champ
  }

  const pdf = (nom = 'rcp.pdf') => {
    const f = new File([new Uint8Array([1, 2, 3])], nom, { type: 'application/pdf' })
    // jsdom ne fournit pas `arrayBuffer()` sur `File`.
    Object.defineProperty(f, 'arrayBuffer', { value: async () => new ArrayBuffer(3) })
    return f
  }

  it('⚠️ un PDF ILLISIBLE ne consomme AUCUN dépôt', async () => {
    // L'ordre EST la décision. `order-upload-url` consomme un dépôt sur trois par compare-and-swap :
    // lire le PDF d'abord, c'est refuser gratuitement un fichier chiffré, corrompu ou vide de couche
    // texte. Dans l'autre ordre, chacun de ces cas prenait une tentative — et trois essais
    // suffisaient à verrouiller une commande payée.
    api.lireStatut.mockResolvedValue(statut())
    ocr.prepareUpgradeSource.mockRejectedValue(new Error('PDF protégé par mot de passe'))
    rendre()
    await screen.findByRole('button', { name: /Choisir mon document/ })
    await choisir(pdf())

    await waitFor(() => expect(ocr.prepareUpgradeSource).toHaveBeenCalled())
    expect(api.demanderUrlDepot).not.toHaveBeenCalled()
    expect(api.televerserAvecReprises).not.toHaveBeenCalled()
    // Et l'acheteur ne reste pas sur un sablier : le dépôt se rouvre, avec la cause nommée.
    expect(await screen.findByText(/protégé par mot de passe ou endommagé/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Choisir mon document/ })).toBeInTheDocument()
  })

  it('un fichier qui n’est pas un PDF n’atteint même pas le lecteur', async () => {
    api.lireStatut.mockResolvedValue(statut())
    rendre()
    await screen.findByRole('button', { name: /Choisir mon document/ })
    await choisir(new File(['x'], 'dossier.docx', { type: 'application/msword' }))
    expect(await screen.findByText(/Seuls les fichiers PDF/)).toBeInTheDocument()
    expect(ocr.prepareUpgradeSource).not.toHaveBeenCalled()
    expect(api.demanderUrlDepot).not.toHaveBeenCalled()
  })

  it('un PDF lisible passe par lecture → dépôt → téléversement → porte, dans cet ordre', async () => {
    api.lireStatut.mockResolvedValue(statut())
    ocr.prepareUpgradeSource.mockResolvedValue({
      sourceKind: 'text',
      controlText: 'contenu de contrôle',
      pageCount: 3,
      recognizedPages: 0,
      truncated: false,
    })
    api.demanderUrlDepot.mockResolvedValue({
      jobId: 'job-1',
      path: 'orders/x/job-1/source.pdf',
      uploadUrl: 'https://s/u',
      uploadToken: 'k',
      depositsLeft: 2,
    })
    api.televerserAvecReprises.mockResolvedValue(undefined)
    api.franchirPorte.mockResolvedValue({ status: 'started', sectionsTotal: 34 })

    rendre()
    await screen.findByRole('button', { name: /Choisir mon document/ })
    await choisir(pdf())

    await waitFor(() => expect(api.franchirPorte).toHaveBeenCalled())
    const ordre = [
      ocr.prepareUpgradeSource.mock.invocationCallOrder[0]!,
      api.demanderUrlDepot.mock.invocationCallOrder[0]!,
      api.televerserAvecReprises.mock.invocationCallOrder[0]!,
      api.franchirPorte.mock.invocationCallOrder[0]!,
    ]
    expect(ordre).toEqual([...ordre].sort((a, b) => a - b))
    // La provenance est DÉCLARÉE par le navigateur : le serveur ne la devine pas.
    expect(api.franchirPorte).toHaveBeenCalledWith(JETON, 'job-1', 'contenu de contrôle', 'text')
  })

  it('un REFUS de recevabilité affiche le message du serveur, tel quel', async () => {
    // Il dit lui-même que rien n'a été débité. Le reformuler perdrait exactement cette phrase-là.
    api.lireStatut.mockResolvedValue(statut())
    ocr.prepareUpgradeSource.mockResolvedValue({
      sourceKind: 'text',
      controlText: 'texte',
      pageCount: 1,
      recognizedPages: 0,
      truncated: false,
    })
    api.demanderUrlDepot.mockResolvedValue({
      jobId: 'job-1',
      path: 'p',
      uploadUrl: 'u',
      uploadToken: 'k',
      depositsLeft: 2,
    })
    api.televerserAvecReprises.mockResolvedValue(undefined)
    api.franchirPorte.mockResolvedValue({
      status: 'refused',
      message: 'Ce document ne ressemble pas à un RCP. Cette tentative ne vous a rien coûté.',
      depositsLeft: 2,
    })

    rendre()
    await screen.findByRole('button', { name: /Choisir mon document/ })
    await choisir(pdf())
    expect(await screen.findByText(/ne vous a rien coûté/)).toBeInTheDocument()
  })
})

/* ────────────────────────── Le document que le pont a déjà téléversé ───────────────────────── */

describe('reprise du document déposé par le pont', () => {
  it('le document déjà déposé est repris — l’acheteur ne le redépose pas', async () => {
    // ⚠️ Sans cette reprise, l'acheteur qui vient de `pharnos.com` se voyait redemander un document
    // déjà envoyé, et ce second dépôt consommait une des trois tentatives d'une commande payée.
    api.lireStatut.mockResolvedValue(statut({ statut: 'paid' }))
    api.demanderSource.mockResolvedValue({
      jobId: 'job-9',
      docType: 'labeling',
      url: 'https://s/signed',
      expiresIn: 600,
    })
    api.telechargerSource.mockResolvedValue(new ArrayBuffer(8))
    ocr.prepareUpgradeSource.mockResolvedValue({
      sourceKind: 'ocr',
      controlText: 'texte océrisé',
      pageCount: 5,
      recognizedPages: 5,
      truncated: false,
    })
    api.franchirPorte.mockResolvedValue({ status: 'started' })

    rendre()
    await waitFor(() => expect(api.franchirPorte).toHaveBeenCalled())
    expect(api.demanderUrlDepot).not.toHaveBeenCalled()
    expect(api.franchirPorte).toHaveBeenCalledWith(JETON, 'job-9', 'texte océrisé', 'ocr')
  })

  it('⚠️ après un REFUS, on ne redemande pas la source au serveur', async () => {
    // Le document le plus récent est alors celui que la porte vient d'écarter : le reprendre, ce
    // serait le re-préparer, le re-soumettre, se le voir refuser — jusqu'à épuiser les trois dépôts.
    api.lireStatut.mockResolvedValue(statut({ statut: 'gated_out', depositsLeft: 2 }))
    rendre()
    expect(await screen.findByRole('button', { name: /Choisir mon document/ })).toBeInTheDocument()
    expect(api.demanderSource).not.toHaveBeenCalled()
  })

  it('une panne pendant la reprise ne propose PAS de redéposer — elle propose de REPRENDRE', async () => {
    // Proposer un dépôt à quelqu'un dont le document EST déjà chez nous, c'est l'inviter à brûler
    // une tentative pour un incident réseau qui n'est pas le sien.
    api.lireStatut.mockResolvedValue(statut({ statut: 'source_uploaded' }))
    api.demanderSource.mockRejectedValue(new UpgradeApiError('indisponible', 'injoignable'))
    rendre()
    await waitFor(() => expect(api.demanderSource).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Choisir mon document/ })).not.toBeInTheDocument()
    // ⚠️ Et surtout : il RESTE une sortie. C'était le dernier sablier définitif de cet écran — un
    // « ne fermez pas cet onglet » sous lequel plus rien ne tournait, sans un bouton.
    expect(
      await screen.findByRole('button', { name: /Reprendre la préparation/ }),
    ).toBeInTheDocument()
  })

  it('⚠️ un TÉLÉCHARGEMENT raté laisse une sortie, pas un sablier', async () => {
    //  écrit  dès qu'il constate le fichier — donc avant que le
    // navigateur ait pu le télécharger. Une coupure ici laissait l'écran sur « Lecture de votre
    // document… », sans message, sans bouton, et sans sondage : plus rien ne tournait.
    api.lireStatut.mockResolvedValue(statut({ statut: 'source_uploaded' }))
    api.demanderSource.mockResolvedValue({
      jobId: 'job-3',
      docType: 'rcp',
      url: 'https://s/signed',
      expiresIn: 600,
    })
    api.telechargerSource.mockRejectedValue(new UpgradeApiError('indisponible', 'injoignable'))
    rendre()
    await waitFor(() => expect(api.telechargerSource).toHaveBeenCalled())
    expect(
      await screen.findByRole('button', { name: /Reprendre la préparation/ }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Lecture de votre document/)).not.toBeInTheDocument()
  })

  it('⚠️ une PORTE injoignable laisse une sortie aussi', async () => {
    api.lireStatut.mockResolvedValue(statut({ statut: 'source_uploaded' }))
    api.demanderSource.mockResolvedValue({
      jobId: 'job-4',
      docType: 'rcp',
      url: 'https://s/signed',
      expiresIn: 600,
    })
    api.telechargerSource.mockResolvedValue(new ArrayBuffer(8))
    ocr.prepareUpgradeSource.mockResolvedValue({
      sourceKind: 'text',
      controlText: 'texte',
      pageCount: 2,
      recognizedPages: 0,
      truncated: false,
    })
    api.franchirPorte.mockRejectedValue(new UpgradeApiError('indisponible', 'injoignable'))
    rendre()
    await waitFor(() => expect(api.franchirPorte).toHaveBeenCalled())
    expect(
      await screen.findByRole('button', { name: /Reprendre la préparation/ }),
    ).toBeInTheDocument()
  })
})

/* ────────────────────────────────── Ce que l'écran promet ──────────────────────────────────── */

describe('suivi et livraison', () => {
  it('pendant le traitement, et SEULEMENT là, l’acheteur peut fermer la page', async () => {
    api.lireStatut.mockResolvedValue(statut({ statut: 'running', faites: 12, total: 34 }))
    rendre()
    expect(await screen.findByText(/Vous pouvez fermer cette page/)).toBeInTheDocument()
    expect(screen.getByText('12 / 34')).toBeInTheDocument()
  })

  it('la promesse d’un e-mail n’est pas faite tant que cet e-mail n’existe pas', async () => {
    // L'e-mail n°2 appartient à U5. Une promesse adossée à un envoi qui n'existe pas transforme
    // une fermeture d'onglet en abandon silencieux.
    api.lireStatut.mockResolvedValue(statut({ statut: 'running', faites: 1, total: 34 }))
    rendre()
    await screen.findByText(/Vous pouvez fermer cette page/)
    expect(screen.queryByText(/e-mail vous préviendra/)).not.toBeInTheDocument()
  })

  it('une panne est présentée comme une panne, avec une commande qui reste ouverte', async () => {
    api.lireStatut.mockResolvedValue(statut({ statut: 'failed', erreur: 'phase conformity' }))
    rendre()
    expect(await screen.findByText(/sans nouveau paiement/)).toBeInTheDocument()
  })
})
