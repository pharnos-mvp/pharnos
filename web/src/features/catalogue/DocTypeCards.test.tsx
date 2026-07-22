import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { docTypesFor, requiresExpiry } from './doc-types'
import { DocTypeCards } from './DocTypeCards'

const renderI = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider })

const pdf = (name = 'piece.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' })

/** Input fichier caché de la carte à l'index donné (une carte = un input, ordre des types). */
function fileInputAt(container: HTMLElement, index: number): HTMLInputElement {
  const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  const el = inputs[index]
  if (!el) throw new Error(`Pas d'input fichier à l'index ${index}`)
  return el
}

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

  it("INFO : l'en-tête de carte OUVRE la liste des pièces (voir/retirer après ajout direct)", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const info = docTypesFor('info')[0]!
    const draft = {
      id: 'd1',
      category: 'info' as const,
      docType: info.code,
      file: pdf('notice.pdf'),
      issueDate: null,
      expiryDate: null,
      holder: null,
      country: null,
      reference: null,
      batchNumber: null,
    }
    renderI(<DocTypeCards category="info" drafts={[draft]} onAdd={() => {}} onRemove={onRemove} />)

    // Clic sur le titre de la carte → la liste se déplie avec la pièce. (Libellé échappé : il
    // contient des parenthèses, ex. « RCP (Résumé des Caractéristiques du Produit) ».)
    const esc = info.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await user.click(screen.getByRole('button', { name: new RegExp(esc) }))
    expect(screen.getByText('notice.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retirer' }))
    expect(onRemove).toHaveBeenCalledWith('d1')
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
