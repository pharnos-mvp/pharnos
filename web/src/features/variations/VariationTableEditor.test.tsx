// @vitest-environment jsdom
import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { VariationTableEditor, type VariationTableHandle } from './VariationTableEditor'

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

function renderEditor(
  opts: { controlsInBar?: boolean; ref?: React.Ref<VariationTableHandle> } = {},
) {
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  render(
    <I18nContext.Provider value={i18n}>
      <VariationTableEditor
        dossier={{ id: 'd1', productName: 'Gynoril', country: 'BJ', variations: [3, 13] }}
        product={PRODUCT}
        controlsInBar={opts.controlsInBar}
        ref={opts.ref}
      />
    </I18nContext.Provider>,
  )
}

describe('VariationTableEditor', () => {
  it('rend le document A4 du tableau : titre, natures, « ancien » prérempli, N° d’AMM inline et Enregistrer', () => {
    renderEditor()
    // Document A4 éditable (≠ ancien form de lignes / badges de classe).
    expect(screen.getByText('ANNEXE — TABLEAU DE VARIATION')).toBeInTheDocument()
    // n°3 = changement de nom (mineure), n°13 = site (majeure) — natures en lecture seule dans le tableau.
    expect(screen.getAllByText(/Changement du nom du médicament/).length).toBeGreaterThan(0)
    // Cellule « situation actuelle » de la variation #3 préremplie depuis la fiche produit.
    expect(screen.getByDisplayValue('Gynoril')).toBeInTheDocument()
    // Plus de case-formulaire AMM séparée : le N° d'AMM est éditable INLINE sur la feuille (méta).
    expect(screen.getByRole('textbox', { name: /AMM/ })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('AMM modifiée')).not.toBeInTheDocument()
    // Repli (sans controlsInBar) : barre locale PDF/DOCX/Enregistrer présente.
    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeInTheDocument()
  })

  it('controlsInBar : barre locale masquée (actions remontées dans l’en-tête) + handle exposé', () => {
    const ref = createRef<VariationTableHandle>()
    renderEditor({ controlsInBar: true, ref })
    // La feuille reste éditable, mais plus de bouton Enregistrer local (il vit dans l'en-tête).
    expect(screen.getByText('ANNEXE — TABLEAU DE VARIATION')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Enregistrer/ })).not.toBeInTheDocument()
    // Le parent pilote PDF/DOCX/Enregistrer via le handle impératif.
    expect(typeof ref.current?.pdf).toBe('function')
    expect(typeof ref.current?.docx).toBe('function')
    expect(typeof ref.current?.save).toBe('function')
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
