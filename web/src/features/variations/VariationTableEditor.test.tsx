// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { VariationTableEditor } from './VariationTableEditor'

const PRODUCT: ProductRecord = {
  id: 'p1',
  orgId: 'o1',
  nomCommercial: 'Gynoril',
  dci: 'Estradiol',
  dosage: '2mg',
  forme: 'comprimé',
  presentation: 'plaquette',
  classeTherapeutique: '',
  codeAtc: 'G03CA03',
  titulaire: 'Labo X',
  fabricant: 'Usine Y',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
}

function renderEditor() {
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  render(
    <I18nContext.Provider value={i18n}>
      <VariationTableEditor
        dossier={{ id: 'd1', productName: 'Gynoril', country: 'BJ', variations: [3, 13] }}
        product={PRODUCT}
      />
    </I18nContext.Provider>,
  )
}

describe('VariationTableEditor', () => {
  it('rend une ligne par variation cochée, avec « ancien » prérempli et badges de classe', () => {
    renderEditor()
    // n°3 = changement de nom (mineure), n°13 = site (majeure) — la nature figure aussi dans l'aperçu.
    expect(screen.getAllByText(/Changement du nom du médicament/).length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('Gynoril')).toBeInTheDocument() // colonne « ancien » préremplie
    expect(screen.getByPlaceholderText('AMM modifiée')).toBeInTheDocument()
    expect(screen.getByText('Mineure')).toBeInTheDocument()
    expect(screen.getByText('Majeure')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeInTheDocument()
  })

  it('message si aucune variation cochée', () => {
    const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
    render(
      <I18nContext.Provider value={i18n}>
        <VariationTableEditor
          dossier={{ id: 'd1', productName: 'X', country: 'BJ', variations: [] }}
        />
      </I18nContext.Provider>,
    )
    expect(screen.getByText(/Aucune variation cochée/)).toBeInTheDocument()
  })
})
