import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { db, type GeneratedDocRecord } from '@/lib/db'
import {
  buildRcpFillContent,
  initialRcpFormState,
  rcpFormStateFromContent,
} from '../template-form/rcp-form-content'
import { TemplateFillForm } from './TemplateFillForm'

async function seedGenDoc(): Promise<GeneratedDocRecord> {
  const ts = new Date().toISOString()
  const rec: GeneratedDocRecord = {
    id: crypto.randomUUID(),
    orgId: 'org-1',
    dossierId: 'd-1',
    nodeNumber: '1.3.1',
    templateKey: 'fill',
    title: 'RCP — template à compléter',
    content: buildRcpFillContent(initialRcpFormState()),
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
  }
  await db.generatedDocs.put(rec)
  return rec
}

describe('TemplateFillForm (formulaire RCP — branding CEO)', () => {
  it('rend la feuille officielle : topbar, titres navy, champs, cases', async () => {
    const rec = await seedGenDoc()
    render(<TemplateFillForm genDoc={rec} countryName="Bénin" orgId="org-1" />)
    expect(screen.getByText('Résumé des Caractéristiques du Produit')).toBeInTheDocument()
    expect(screen.getByText('RESUME DES CARACTERISTIQUES DU PRODUIT')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Télécharger DOCX/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Nom du médicament, dosage, forme pharmaceutique'),
    ).toBeInTheDocument()
    expect(screen.getByText('Aucune étude d’interaction n’a été réalisée.')).toBeInTheDocument()
  })

  it('persiste les saisies (débouncé) dans le content TipTap du document généré', async () => {
    const rec = await seedGenDoc()
    const user = userEvent.setup()
    render(<TemplateFillForm genDoc={rec} countryName="Bénin" orgId="org-1" />)

    await user.type(
      screen.getByPlaceholderText('Nom du médicament, dosage, forme pharmaceutique'),
      'KV-Kacin 500',
    )
    await user.click(screen.getByText('Aucune étude d’interaction n’a été réalisée.'))

    await waitFor(
      async () => {
        const saved = await db.generatedDocs.get(rec.id)
        const state = rcpFormStateFromContent(saved!.content as never)
        expect(state.values.denomination).toBe('KV-Kacin 500')
        expect(state.checks.interactions_chk).toEqual([0])
      },
      { timeout: 3000 },
    )
  })
})
