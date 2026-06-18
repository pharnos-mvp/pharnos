// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { emptyFormState, fieldList, fieldText } from '@/features/workspace/template-form/form-types'
import { RCP_FORM_MODEL } from '@/features/workspace/template-form/rcp-form-model'
import { LABELING_FORM_MODEL } from '@/features/workspace/template-form/labeling-form-model'
import { TemplatePreview } from './TemplatePreview'
import { deleteSavedTemplate, saveTemplate } from './saved-templates-repository'

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

  it('Étiquetage (Labeling) : rubriques QRD EN sous lang="en", FR sous lang="fr"', () => {
    const { unmount } = render(<TemplatePreview model={LABELING_FORM_MODEL} lang="en" />)
    expect(screen.getByText('LABELLING')).toBeInTheDocument()
    expect(screen.getByText(/PARTICULARS TO APPEAR ON THE OUTER PACKAGING/)).toBeInTheDocument()
    expect(screen.getAllByText(/BATCH NUMBER/).length).toBeGreaterThan(0)
    unmount()
    render(<TemplatePreview model={LABELING_FORM_MODEL} lang="fr" />)
    expect(screen.getByText('ETIQUETAGE')).toBeInTheDocument()
  })

  it('mode éditable : la saisie remonte via onChange (clé indépendante de la langue)', () => {
    const state = emptyFormState(RCP_FORM_MODEL)
    let captured = state
    render(
      <TemplatePreview
        model={RCP_FORM_MODEL}
        lang="en"
        editable
        state={state}
        onChange={(s) => {
          captured = s
        }}
      />,
    )
    const first = screen.getAllByRole('textbox')[0]! // champ « dénomination »
    fireEvent.change(first, { target: { value: 'KV-Super Muscle' } })
    expect(Object.values(captured.values)).toContain('KV-Super Muscle')
  })
})

describe('saved-templates-repository (local-first Dexie)', () => {
  it('saveTemplate persiste, deleteSavedTemplate soft-delete', async () => {
    const state = emptyFormState(RCP_FORM_MODEL)
    state.values['denomination'] = 'KV-Super Muscle'
    const id = await saveTemplate({
      orgId: 'org-test',
      docType: 'rcp',
      title: 'RCP KV',
      productName: 'KV-Super Muscle',
      lang: 'en',
      state,
    })
    const rec = await db.savedTemplates.get(id)
    expect(rec?.title).toBe('RCP KV')
    expect(rec?.productName).toBe('KV-Super Muscle')
    expect(rec?.deletedAt).toBeNull()

    await deleteSavedTemplate(id)
    expect((await db.savedTemplates.get(id))?.deletedAt).not.toBeNull()
  })
})
