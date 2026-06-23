// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { I18nContext, type I18nValue } from '@/lib/i18n-context'
import { VariationPicker } from './VariationPicker'

function renderPicker(value: number[] = []) {
  const onChange = vi.fn()
  const i18n: I18nValue = { lang: 'fr', setLang: () => {}, t: (s) => s.fr }
  render(
    <I18nContext.Provider value={i18n}>
      <VariationPicker value={value} onChange={onChange} />
    </I18nContext.Provider>,
  )
  return onChange
}

const clickInput = (text: RegExp) =>
  fireEvent.click(screen.getByText(text).closest('label')!.querySelector('input')!)

describe('VariationPicker', () => {
  it('rend deux colonnes mineure/majeure avec leurs natures et compteurs', () => {
    renderPicker()
    expect(screen.getByText('Variation mineure')).toBeInTheDocument()
    expect(screen.getByText('Variation majeure')).toBeInTheDocument()
    expect(screen.getByText(/Diminution du prix/)).toBeInTheDocument() // n°8, mineure
    expect(screen.getByText(/Augmentation du prix/)).toBeInTheDocument() // n°39, majeure
    expect(screen.getByText('0/12')).toBeInTheDocument()
    expect(screen.getByText('0/30')).toBeInTheDocument()
  })

  it('cocher une variation appelle onChange avec son n°', () => {
    const onChange = renderPicker([])
    clickInput(/Diminution du prix/)
    expect(onChange).toHaveBeenCalledWith([8])
  })

  it('propose « Autre » → onChange avec 0 (OTHER_REF)', () => {
    const onChange = renderPicker([])
    clickInput(/^Autre$/)
    expect(onChange).toHaveBeenCalledWith([0])
  })

  it('décocher une variation déjà cochée la retire', () => {
    const onChange = renderPicker([8])
    clickInput(/Diminution du prix/)
    expect(onChange).toHaveBeenCalledWith([])
  })
})
