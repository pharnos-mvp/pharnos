import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { db, type DocumentRecord } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { docTypesFor, requiresExpiry } from './doc-types'
import { DocTypeCards, type DraftDocument } from './DocTypeCards'
import type { SourceDocEntry } from './SourceDocPicker'

const renderI = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider })

const pdf = (name = 'piece.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

/** Input fichier caché de la carte à l'index donné (2 inputs/carte : [ajout, remplacement]). */
function fileInputAt(container: HTMLElement, index: number): HTMLInputElement {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  const el = inputs[index]
  if (!el) throw new Error(`Pas d'input fichier à l'index ${index}`)
  return el
}

const infoDraft = (over: Partial<DraftDocument> = {}): DraftDocument => ({
  id: 'd1',
  category: 'info',
  docType: docTypesFor('info')[0]!.code,
  file: pdf('notice.pdf'),
  issueDate: null,
  expiryDate: null,
  holder: null,
  country: null,
  reference: null,
  batchNumber: null,
  ...over,
})

// L'aperçu crée une URL objet — jsdom ne fournit pas createObjectURL → stub inoffensif.
beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:mock',
    writable: true,
    configurable: true,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => {},
    writable: true,
    configurable: true,
  })
})

describe('DocTypeCards — ajout de pièces (wizard produit)', () => {
  it('ADMIN : le formulaire se REFERME après « Ajouter la pièce » (point CEO)', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = renderI(
      <DocTypeCards category="admin" drafts={[]} onAdd={onAdd} onRemove={() => {}} />,
    )

    // Ouvre la 1re carte admin (le bouton d'en-tête « Ajouter »).
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    expect(screen.getByRole('button', { name: 'Ajouter la pièce' })).toBeInTheDocument()

    // Fichier + expiration si requise (les inputs date : [délivrance, expiration]).
    fireEvent.change(fileInputAt(container, 0), { target: { files: [pdf()] } })
    if (requiresExpiry(docTypesFor('admin')[0]!.code)) {
      const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]')
      fireEvent.change(dates[1]!, { target: { value: '2030-01-01' } })
    }

    await user.click(screen.getByRole('button', { name: 'Ajouter la pièce' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    // Le formulaire s'est refermé : « + Ajouter » le rouvrira pour la pièce suivante.
    expect(screen.queryByRole('button', { name: 'Ajouter la pièce' })).not.toBeInTheDocument()
  })

  it('ADMIN : incohérence de dates signalée au BLUR seulement, pas pendant la frappe (Monitor)', async () => {
    const user = userEvent.setup()
    const { container } = renderI(
      <DocTypeCards category="admin" drafts={[]} onAdd={() => {}} onRemove={() => {}} />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    fireEvent.change(fileInputAt(container, 0), { target: { files: [pdf()] } })

    // Dates du formulaire admin : [délivrance, expiration]. Délivrance APRÈS expiration = incohérent.
    const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]')
    fireEvent.change(dates[0]!, { target: { value: '2031-01-02' } })
    fireEvent.change(dates[1]!, { target: { value: '2031-01-01' } })

    // Point 1 : RIEN tant qu'on n'a pas quitté le champ (pas de rouge pendant la saisie).
    expect(dates[0]!).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Ajouter la pièce' })).toBeEnabled()

    // Au blur → les deux champs passent en rouge et l'ajout se verrouille.
    fireEvent.blur(dates[1]!)
    expect(dates[0]!).toHaveAttribute('aria-invalid', 'true')
    expect(dates[1]!).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Ajouter la pièce' })).toBeDisabled()

    // Correction (délivrance avant expiration) → l'erreur se lève, l'ajout redevient possible.
    fireEvent.change(dates[0]!, { target: { value: '2030-01-01' } })
    expect(dates[0]!).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('button', { name: 'Ajouter la pièce' })).toBeEnabled()
  })

  it('ADMIN : garde défensive — cliquer AVANT blur (bouton actif) n’ajoute pas + révèle l’erreur', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = renderI(
      <DocTypeCards category="admin" drafts={[]} onAdd={onAdd} onRemove={() => {}} />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    fireEvent.change(fileInputAt(container, 0), { target: { files: [pdf()] } })
    const dates = container.querySelectorAll<HTMLInputElement>('input[type="date"]')
    fireEvent.change(dates[0]!, { target: { value: '2031-01-02' } })
    fireEvent.change(dates[1]!, { target: { value: '2031-01-01' } })

    // Bouton encore actif (pas de blur), mais handleAdd refuse l'ajout ET révèle l'erreur.
    await user.click(screen.getByRole('button', { name: 'Ajouter la pièce' }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(dates[0]!).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Ajouter la pièce' })).toBeDisabled()
  })

  it('INFO : la pièce est ajoutée DIRECTEMENT à la sélection du fichier, sans formulaire', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = renderI(
      <DocTypeCards category="info" drafts={[]} onAdd={onAdd} onRemove={() => {}} />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    // Aucun formulaire ne se déplie pour un document d'info.
    expect(screen.queryByRole('button', { name: 'Ajouter la pièce' })).not.toBeInTheDocument()

    fireEvent.change(fileInputAt(container, 0), { target: { files: [pdf('rcp.pdf')] } })

    expect(onAdd).toHaveBeenCalledTimes(1)
    const draft = onAdd.mock.calls[0]![0] as { category: string; docType: string; file: File }
    expect(draft.category).toBe('info')
    expect(draft.docType).toBe(docTypesFor('info')[0]!.code)
    expect(draft.file.name).toBe('rcp.pdf')
  })

  it('INFO : la pièce ajoutée est TOUJOURS visible (nom + retrait), sans dépliage', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    renderI(
      <DocTypeCards category="info" drafts={[infoDraft()]} onAdd={() => {}} onRemove={onRemove} />,
    )

    // Le nom est visible d'emblée — plus besoin de cliquer sur le titre pour dérouler la liste.
    expect(screen.getByText('notice.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(onRemove).toHaveBeenCalledWith('d1')
  })

  it('ADMIN : « Remplacer le fichier » conserve les métadonnées (retrait + réajout, nouvel id)', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onRemove = vi.fn()
    const draft: DraftDocument = {
      id: 'd1',
      category: 'admin',
      docType: docTypesFor('admin')[0]!.code,
      file: pdf('amm.pdf'),
      issueDate: '2025-01-01',
      expiryDate: '2030-06-01',
      holder: 'Sahel Pharma SARL',
      country: 'CI',
      reference: 'AMM_2015_7457',
      batchNumber: null,
    }
    const { container } = renderI(
      <DocTypeCards category="admin" drafts={[draft]} onAdd={onAdd} onRemove={onRemove} />,
    )

    // Cible la pièce à remplacer (arme replaceTarget), puis simule le choix du nouveau fichier.
    await user.click(screen.getByRole('button', { name: 'Remplacer le fichier' }))
    fireEvent.change(fileInputAt(container, 1), { target: { files: [pdf('amm-v2.pdf')] } })

    expect(onRemove).toHaveBeenCalledWith('d1')
    expect(onAdd).toHaveBeenCalledTimes(1)
    const next = onAdd.mock.calls[0]![0] as DraftDocument
    expect(next.file.name).toBe('amm-v2.pdf')
    // Toutes les métadonnées réglementaires survivent au remplacement…
    expect(next.holder).toBe('Sahel Pharma SARL')
    expect(next.expiryDate).toBe('2030-06-01')
    expect(next.issueDate).toBe('2025-01-01')
    expect(next.reference).toBe('AMM_2015_7457')
    expect(next.country).toBe('CI')
    // …avec un NOUVEL id (évite toute collision de clé dans la liste).
    expect(next.id).not.toBe('d1')
  })

  it('APERÇU : l’œil ouvre la pièce au premier plan (dialog nommé par le fichier)', async () => {
    const user = userEvent.setup()
    renderI(
      <DocTypeCards
        category="info"
        drafts={[infoDraft({ file: new File(['x'], 'photo.png', { type: 'image/png' }) })]}
        onAdd={() => {}}
        onRemove={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Prévisualiser' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('photo.png')).toBeInTheDocument()
    // Image → rendu inline (pas le repli « format non disponible »).
    expect(within(dialog).getByRole('img', { name: 'photo.png' })).toBeInTheDocument()
  })

  it('INFO : un fichier de type interdit est REJETÉ (pas d’ajout silencieux)', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const { container } = renderI(
      <DocTypeCards category="info" drafts={[]} onAdd={onAdd} onRemove={() => {}} />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    const exe = new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' })
    fireEvent.change(fileInputAt(container, 0), { target: { files: [exe] } })

    expect(onAdd).not.toHaveBeenCalled()
  })
})

/** Pièce ORG-scopée « piochable » (base d'une organisation) pour les tests du picker §2. */
function sourceEntry(over: Partial<DocumentRecord> = {}): SourceDocEntry {
  const doc: DocumentRecord = {
    id: 'src-1',
    orgId: 'org-1',
    productId: '',
    partyId: 'party-fab',
    category: 'info',
    docType: docTypesFor('info')[0]!.code,
    fileName: 'rcp-base.pdf',
    mimeType: 'application/pdf',
    size: 8,
    language: 'fr',
    expiryDate: null,
    issueDate: null,
    reference: null,
    holder: null,
    country: null,
    batchNumber: null,
    status: 'active',
    filePath: null,
    uploaded: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  }
  return { doc, orgName: 'Sahel Pharma SARL' }
}

describe('DocTypeCards — « Depuis la base » (§2, pioche org → produit)', () => {
  it('avec des sources, « + » propose les DEUX chemins ; la pioche crée un brouillon avec provenance', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const entry = sourceEntry({ expiryDate: '2027-06-30', reference: 'REF-9' })
    // Blob local épinglé (offline-first) — `sourceDocFile` le résout sans réseau.
    await db.documentBlobs.put({ id: entry.doc.id, blob: pdf('rcp-base.pdf') })

    renderI(
      <DocTypeCards
        category="info"
        drafts={[]}
        onAdd={onAdd}
        onRemove={() => {}}
        sources={[entry]}
      />,
    )

    // « + » de la carte RCP (1re carte info) → menu à deux chemins.
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    expect(
      screen.getByRole('menuitem', { name: /Depuis la base de Sahel Pharma SARL/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Depuis mon poste' })).toBeInTheDocument()

    // Pioche → picker → choisir la pièce.
    await user.click(screen.getByRole('menuitem', { name: /Depuis la base/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /rcp-base\.pdf/ }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const draft = onAdd.mock.calls[0]![0] as DraftDocument
    expect(draft.sourceDocId).toBe('src-1')
    expect(draft.docType).toBe(entry.doc.docType)
    expect(draft.expiryDate).toBe('2027-06-30')
    expect(draft.reference).toBe('REF-9')
    expect(draft.file.name).toBe('rcp-base.pdf')
    // Le picker se referme au succès.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('les sources d’un AUTRE type ne changent rien : « + » reste l’upload direct', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    // Source de type notice → la carte RCP (1re) n'a AUCUNE source : pas de menu.
    const entry = sourceEntry({ docType: docTypesFor('info')[1]!.code })

    renderI(
      <DocTypeCards
        category="info"
        drafts={[]}
        onAdd={onAdd}
        onRemove={() => {}}
        sources={[entry]}
      />,
    )

    await user.click(screen.getAllByRole('button', { name: 'Ajouter' })[0]!)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })
})
