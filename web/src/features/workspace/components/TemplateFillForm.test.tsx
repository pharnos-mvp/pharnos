import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { db, type GeneratedDocRecord } from '@/lib/db'
import { buildFillContent, formStateFromContent } from '../template-form/form-content'
import { initialFormState, type TemplateFormDefinition } from '../template-form/form-types'
import { NOTICE_FORM_DEFINITION } from '../template-form/notice-form-model'
import { RCP_FORM_DEFINITION } from '../template-form/rcp-form-model'
import { I18nProvider } from '@/lib/I18nProvider'
import { TemplateFillForm } from './TemplateFillForm'
import type { ReactElement } from 'react'

const renderI = (ui: ReactElement) => render(ui, { wrapper: I18nProvider })

async function seedGenDoc(def: TemplateFormDefinition): Promise<GeneratedDocRecord> {
  const ts = new Date().toISOString()
  const rec: GeneratedDocRecord = {
    id: crypto.randomUUID(),
    orgId: 'org-1',
    dossierId: 'd-1',
    nodeNumber: '1.3.1',
    templateKey: 'fill',
    title: `${def.slugPrefix} — template à compléter`,
    content: buildFillContent(def, initialFormState(def)),
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.generatedDocs.put(rec)
  return rec
}

describe('TemplateFillForm (formulaires officiels — branding CEO)', () => {
  it('RCP : feuille officielle (topbar, titres navy, champs, cases) — pas de barre globale', async () => {
    const rec = await seedGenDoc(RCP_FORM_DEFINITION)
    renderI(
      <TemplateFillForm def={RCP_FORM_DEFINITION} genDoc={rec} countryName="Bénin" orgId="org-1" />,
    )
    expect(screen.getByText('Résumé des Caractéristiques du Produit')).toBeInTheDocument()
    expect(screen.getByText('RESUME DES CARACTERISTIQUES DU PRODUIT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Télécharger DOCX/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Nom du médicament, dosage, forme pharmaceutique'),
    ).toBeInTheDocument()
    expect(screen.getByText('Aucune étude d’interaction n’a été réalisée.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Verbe employé')).not.toBeInTheDocument()
  })

  it('persiste les saisies (débouncé) dans le content TipTap du document généré', async () => {
    const rec = await seedGenDoc(RCP_FORM_DEFINITION)
    const user = userEvent.setup()
    renderI(
      <TemplateFillForm def={RCP_FORM_DEFINITION} genDoc={rec} countryName="Bénin" orgId="org-1" />,
    )

    await user.type(
      screen.getByPlaceholderText('Nom du médicament, dosage, forme pharmaceutique'),
      'KV-Kacin 500',
    )
    await user.click(screen.getByText('Aucune étude d’interaction n’a été réalisée.'))

    await waitFor(
      async () => {
        const saved = await db.generatedDocs.get(rec.id)
        const state = formStateFromContent(RCP_FORM_DEFINITION, saved!.content as never)
        expect(state.values.denomination).toBe('KV-Kacin 500')
        expect(state.checks.interactions_chk).toEqual([0])
      },
      { timeout: 3000 },
    )
  })

  it('Notice : barre des réglages globaux — le verbe re-rend les textes dynamiques', async () => {
    const rec = await seedGenDoc(NOTICE_FORM_DEFINITION)
    const user = userEvent.setup()
    renderI(
      <TemplateFillForm
        def={NOTICE_FORM_DEFINITION}
        genDoc={rec}
        countryName="Bénin"
        orgId="org-1"
      />,
    )
    expect(screen.getByText('NOTICE : INFORMATION DE L’UTILISATEUR')).toBeInTheDocument()
    expect(screen.getByText(/avant de prendre ce médicament car elle contient/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Verbe employé'), 'utiliser')
    expect(screen.getByText(/avant d’utiliser ce médicament car elle contient/)).toBeInTheDocument()
    expect(screen.getByText(/COMMENT UTILISER CE MEDICAMENT/)).toBeInTheDocument()

    // Champ conditionnel : caché tant que la case « amélioration » n'est pas cochée.
    expect(screen.queryByPlaceholderText('nombre de jours')).not.toBeInTheDocument()
    await user.click(screen.getByText(/aucune amélioration ou si vous vous sentez moins bien/))
    expect(screen.getByPlaceholderText('nombre de jours')).toBeInTheDocument()
  })
})
