// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { VariationNaturesPicker } from './VariationNaturesPicker'

function renderPicker(value: number[] = []) {
  const onChange = vi.fn()
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  render(
    <I18nContext.Provider value={i18n}>
      <VariationNaturesPicker value={value} onChange={onChange} />
    </I18nContext.Provider>,
  )
  return onChange
}

const clickInput = (text: RegExp) =>
  fireEvent.click(screen.getByText(text).closest('label')!.querySelector('input')!)

describe('VariationNaturesPicker', () => {
  it('affiche le segmenté Mineures/Majeures et la classe mineure par défaut', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: /Mineures/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Majeures/ })).toBeInTheDocument()
    expect(screen.getByText(/Diminution du prix/)).toBeInTheDocument() // n°8, mineure
    // Une nature majeure n'est PAS visible tant qu'on n'a pas basculé d'onglet.
    expect(screen.queryByText(/Augmentation du prix/)).not.toBeInTheDocument()
  })

  it('bascule sur Majeures et affiche les natures majeures', () => {
    renderPicker()
    fireEvent.click(screen.getByRole('button', { name: /Majeures/ }))
    expect(screen.getByText(/Augmentation du prix/)).toBeInTheDocument() // n°39, majeure
  })

  it('cocher une nature appelle onChange avec son n°', () => {
    const onChange = renderPicker([])
    clickInput(/Diminution du prix/)
    expect(onChange).toHaveBeenCalledWith([8])
  })

  it('décocher une nature déjà cochée la retire', () => {
    const onChange = renderPicker([8])
    clickInput(/Diminution du prix/)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('la recherche filtre la liste de la classe active', () => {
    renderPicker()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'prix' } })
    expect(screen.getByText(/Diminution du prix/)).toBeInTheDocument()
    expect(screen.queryByText(/Changement de la raison sociale/)).not.toBeInTheDocument()
  })

  it('propose « Autre » → onChange avec 0 (OTHER_REF)', () => {
    const onChange = renderPicker([])
    clickInput(/^Autre$/)
    expect(onChange).toHaveBeenCalledWith([0])
  })
})
