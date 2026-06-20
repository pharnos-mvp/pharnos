// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  checkText,
  DEFAULT_GLOBALS,
  emptyFormState,
  fieldDyn,
  fieldDynList,
  fieldList,
  fieldText,
  subSelectHeading,
  type CheckBlock,
} from '@/features/workspace/template-form/form-types'
import { formDefinitionFor } from '@/features/workspace/template-form/form-definitions'
import { buildFormPrintHtml } from '@/features/workspace/template-form/form-print'
import { buildFormDocument } from '@/features/workspace/template-form/form-docx'
import { RCP_FORM_MODEL } from '@/features/workspace/template-form/rcp-form-model'
import { LABELING_FORM_MODEL } from '@/features/workspace/template-form/labeling-form-model'
import { NOTICE_FORM_MODEL } from '@/features/workspace/template-form/notice-form-model'
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

describe('export bilingue des templates (PDF/DOCX threadés `lang`)', () => {
  it('buildFormPrintHtml : EN rend les rubriques SmPC, FR (défaut) les rubriques FR', () => {
    const def = formDefinitionFor('rcp')!
    const state = emptyFormState(def.model)
    const fr = buildFormPrintHtml(def, state) // défaut 'fr'
    expect(fr).toContain('DONNEES CLINIQUES')
    expect(fr).not.toContain('CLINICAL PARTICULARS')
    expect(fr).toContain('lang="fr"')
    const en = buildFormPrintHtml(def, state, 'en')
    expect(en).toContain('CLINICAL PARTICULARS')
    expect(en).not.toContain('DONNEES CLINIQUES')
    expect(en).toContain('lang="en"')
  })
  it('buildFormDocument : construit le .docx dans les deux langues (mêmes résolveurs)', () => {
    const def = formDefinitionFor('rcp')!
    const state = emptyFormState(def.model)
    expect(() => buildFormDocument(def, state)).not.toThrow()
    expect(() => buildFormDocument(def, state, 'en')).not.toThrow()
  })
})

describe('TemplatePreview — Notice (PIL) bilingue (EMA QRD)', () => {
  it('rend la prose patient EN (QRD) sous lang="en"', () => {
    render(<TemplatePreview model={NOTICE_FORM_MODEL} lang="en" />)
    expect(screen.getByText('PACKAGE LEAFLET: INFORMATION FOR THE USER')).toBeInTheDocument()
    expect(screen.getByText('What is in this leaflet')).toBeInTheDocument()
    expect(screen.getByText('4. Possible side effects')).toBeInTheDocument()
    // prose DYNAMIQUE (verbe + professionnels de santé) résolue en anglais
    expect(
      screen.getByText(/Read all of this leaflet carefully before you start taking/),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/ask your doctor or pharmacist/).length).toBeGreaterThan(0)
    // option de subSelect mappée FR→EN (aperçu read-only = liste jointe)
    expect(screen.getByText(/Pregnancy and breast-feeding/)).toBeInTheDocument()
  })

  it('rend la notice FR (verbatim) sous lang="fr"', () => {
    render(<TemplatePreview model={NOTICE_FORM_MODEL} lang="fr" />)
    expect(screen.getByText('NOTICE : INFORMATION DE L’UTILISATEUR')).toBeInTheDocument()
    expect(screen.getByText('Que contient cette notice ?')).toBeInTheDocument()
    expect(screen.getByText(/Veuillez lire attentivement cette notice/)).toBeInTheDocument()
  })

  it('toggle de langue préserve la saisie (clé indépendante de la langue)', () => {
    const state = emptyFormState(NOTICE_FORM_MODEL)
    let captured = state
    const { rerender } = render(
      <TemplatePreview
        model={NOTICE_FORM_MODEL}
        lang="fr"
        editable
        state={state}
        onChange={(s) => {
          captured = s
        }}
      />,
    )
    fireEvent.change(screen.getAllByRole('textbox')[0]!, { target: { value: 'Gynoril Ovule' } })
    expect(Object.values(captured.values)).toContain('Gynoril Ovule')
    rerender(
      <TemplatePreview
        model={NOTICE_FORM_MODEL}
        lang="en"
        editable
        state={captured}
        onChange={(s) => {
          captured = s
        }}
      />,
    )
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('Gynoril Ovule')
  })
})

describe('résolveurs dynamiques bilingues (Notice)', () => {
  const g = DEFAULT_GLOBALS
  it('fieldDyn : fonction EN résolue si dispo, sinon repli FR', () => {
    expect(
      fieldDyn(
        () => 'FR',
        () => 'EN',
        'en',
        g,
      ),
    ).toBe('EN')
    expect(
      fieldDyn(
        () => 'FR',
        () => 'EN',
        'fr',
        g,
      ),
    ).toBe('FR')
    expect(fieldDyn(() => 'FR', undefined, 'en', g)).toBe('FR')
  })
  it('fieldDynList : EN seulement si même longueur (sinon repli FR)', () => {
    expect(fieldDynList(['a', 'b'], ['x', 'y'], 'en', g)).toEqual(['x', 'y'])
    expect(fieldDynList(['a', 'b'], ['x'], 'en', g)).toEqual(['a', 'b'])
  })
  it('subSelectHeading : mappe le choix FR stocké → libellé EN par index (repli FR)', () => {
    const b = {
      type: 'subSelect' as const,
      key: 'k',
      before: 'Grossesse',
      beforeEn: 'Pregnancy',
      options: ['Grossesse et allaitement', 'Grossesse et fertilité'],
      optionsEn: ['Pregnancy and breast-feeding', 'Pregnancy and fertility'],
      headingText: (c: string) => c,
    }
    expect(subSelectHeading(b, 'Grossesse et allaitement', 'en')).toBe(
      'Pregnancy and breast-feeding',
    )
    expect(subSelectHeading(b, 'Grossesse et allaitement', 'fr')).toBe('Grossesse et allaitement')
  })
  it('checkText : texte EN composé (« after N days ») via exportTextEn ; FR via exportText', () => {
    const def = formDefinitionFor('notice')!
    const ame = def.model.find((x) => 'key' in x && x.key === 'amelioration') as CheckBlock
    const state = emptyFormState(def.model)
    state.values['amelioration_jours'] = '3'
    expect(checkText(ame, state, state.globals, 'en')).toContain('after 3 days')
    expect(checkText(ame, state, state.globals, 'fr')).toContain('après 3 jours')
  })
})

describe('export Notice EN (print) — prose dynamique + subSelect mappé', () => {
  it('buildFormPrintHtml : EN rend la prose QRD et mappe le subSelect ; FR par défaut', () => {
    const def = formDefinitionFor('notice')!
    const state = emptyFormState(def.model)
    state.selects['grossesse_sel'] = 'Grossesse et allaitement' // choix stocké en FR
    const en = buildFormPrintHtml(def, state, 'en')
    expect(en).toContain('PACKAGE LEAFLET: INFORMATION FOR THE USER')
    expect(en).toContain('Pregnancy and breast-feeding') // subSelect FR→EN par index
    expect(en).not.toContain('NOTICE : INFORMATION DE L’UTILISATEUR')
    const fr = buildFormPrintHtml(def, state)
    expect(fr).toContain('NOTICE : INFORMATION DE L’UTILISATEUR')
    expect(fr).toContain('Grossesse et allaitement')
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
