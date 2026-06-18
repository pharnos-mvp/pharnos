// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fieldList, fieldText } from '@/features/workspace/template-form/form-types'
import { RCP_FORM_MODEL } from '@/features/workspace/template-form/rcp-form-model'
import { TemplatePreview } from './TemplatePreview'

describe('résolveur bilingue (fieldText / fieldList)', () => {
  it('fieldText : EN si demandé ET disponible, sinon repli FR', () => {
    expect(fieldText('FR', 'EN', 'en')).toBe('EN')
    expect(fieldText('FR', 'EN', 'fr')).toBe('FR')
    expect(fieldText('FR', undefined, 'en')).toBe('FR') // pas de trou
  })
  it('fieldList : EN seulement si même longueur (sinon repli FR)', () => {
    expect(fieldList(['a', 'b'], ['x', 'y'], 'en')).toEqual(['x', 'y'])
    expect(fieldList(['a', 'b'], ['x'], 'en')).toEqual(['a', 'b']) // incohérent → FR
    expect(fieldList(['a'], ['x'], 'fr')).toEqual(['a'])
  })
})

describe('TemplatePreview — RCP bilingue (SmPC/MedDRA)', () => {
  it('rend les rubriques SmPC EN sous lang="en"', () => {
    render(<TemplatePreview model={RCP_FORM_MODEL} lang="en" />)
    expect(screen.getByText('SUMMARY OF PRODUCT CHARACTERISTICS')).toBeInTheDocument()
    expect(screen.getByText(/CLINICAL PARTICULARS/)).toBeInTheDocument()
    expect(screen.getByText(/MARKETING AUTHORISATION HOLDER/)).toBeInTheDocument()
    expect(
      screen.getByText(/Undesirable effects \(by MedDRA system organ class/),
    ).toBeInTheDocument()
  })
  it('rend les rubriques FR (verbatim) sous lang="fr"', () => {
    render(<TemplatePreview model={RCP_FORM_MODEL} lang="fr" />)
    expect(screen.getByText('RESUME DES CARACTERISTIQUES DU PRODUIT')).toBeInTheDocument()
    expect(screen.getByText(/DONNEES CLINIQUES/)).toBeInTheDocument()
  })
})
