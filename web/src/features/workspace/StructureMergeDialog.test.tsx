import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { StructureMergeDialog } from './StructureMergeDialog'
import type { MergeLine } from './structure-merge'

// P4.5c — l'écran de fusion est le point où l'utilisateur ENGAGE une photographie opposable.
// Ces tests vérifient que ce qu'il voit correspond à ce qui sera appliqué : une conservation n'est
// pas cochable, le compteur du bouton dit la vérité, et seules les lignes cochées remontent.

const PLAN: MergeLine[] = [
  { kind: 'add', number: '1.2.9', label: 'Attestation de pharmacovigilance', childCount: 0 },
  {
    kind: 'relabel',
    number: '1.3.3',
    label: 'Étiquetage et conditionnement',
    currentLabel: 'Étiquetage',
  },
  { kind: 'drop', number: '1.4.2', label: 'Section vide', docCount: 0 },
  {
    kind: 'keep',
    number: '1.1.2',
    label: 'Lettre de prix (PGHT)',
    docCount: 1,
    keepReason: 'documents',
  },
]

const setup = (onApply = vi.fn()) => {
  render(
    <I18nProvider>
      <StructureMergeDialog
        open
        onOpenChange={vi.fn()}
        plan={PLAN}
        productName="KV-10D"
        country="TG"
        versionLabel="v2026.2"
        provenance={{ texte: 'Arrêté n° 2026-042/MSHP', jo: 'JO Togo n° 12' }}
        busy={false}
        onApply={onApply}
      />
    </I18nProvider>,
  )
  return { onApply, user: userEvent.setup() }
}

describe('StructureMergeDialog', () => {
  it('montre CHAQUE changement proposé avec son numéro de section', () => {
    setup()
    for (const n of ['1.2.9', '1.3.3', '1.4.2']) {
      expect(screen.getByText(n)).toBeInTheDocument()
    }
    expect(screen.getByText('Attestation de pharmacovigilance')).toBeInTheDocument()
    // Le renommage montre l'avant ET l'après (l'utilisateur voit ce qu'il perd).
    expect(screen.getByText('Étiquetage')).toBeInTheDocument()
    expect(screen.getByText('Étiquetage et conditionnement')).toBeInTheDocument()
  })

  it('la section CONSERVÉE est annoncée mais n’offre AUCUNE case à cocher', () => {
    setup()
    expect(screen.getByText('Lettre de prix (PGHT)')).toBeInTheDocument()
    expect(screen.getByText(/ne supprime jamais votre travail/i)).toBeInTheDocument()
    // 3 propositions cochables, la conservation n'en fait pas partie.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('cite la SOURCE officielle — la raison du changement', () => {
    setup()
    expect(screen.getByText(/Arrêté n° 2026-042\/MSHP/)).toBeInTheDocument()
    expect(screen.getByText(/JO Togo n° 12/)).toBeInTheDocument()
  })

  it('affiche la version qui porte la structure, et le pays EN TEXTE (lecteur d’écran)', () => {
    setup()
    expect(screen.getByText('v2026.2')).toBeInTheDocument()
    // Le drapeau est décoratif : sans libellé, un lecteur d'écran n'annonce pas le pays.
    expect(screen.getByText('Togo')).toBeInTheDocument()
  })

  it('seul l’AJOUT est coché à l’ouverture ; le compteur suit les cases', async () => {
    const { user } = setup()
    // Retrait et renommage exigent un geste : pré-cocher une ligne destructrice ferait d'un simple
    // décalage d'affichage une perte de travail.
    expect(screen.getByRole('button', { name: /Appliquer 1 changement/ })).toBeInTheDocument()

    await user.click(screen.getAllByRole('checkbox')[2]!) // coche le retrait
    expect(screen.getByRole('button', { name: /Appliquer 2 changements/ })).toBeInTheDocument()
  })

  it('tout décocher DÉSACTIVE l’action (jamais un clic qui ne fait rien)', async () => {
    const { user } = setup()
    await user.click(screen.getAllByRole('checkbox')[0]!) // décoche le seul coché

    expect(screen.getByRole('button', { name: /Aucun changement retenu/ })).toBeDisabled()
  })

  it('ne remonte QUE les lignes cochées', async () => {
    const { onApply, user } = setup()
    // Coche le retrait (3ᵉ case) et laisse le renommage décoché.
    await user.click(screen.getAllByRole('checkbox')[2]!)
    await user.click(screen.getByRole('button', { name: /Appliquer 2 changements/ }))

    expect(onApply).toHaveBeenCalledTimes(1)
    const chosen = onApply.mock.calls[0]![0] as Set<string>
    expect([...chosen].sort()).toEqual(['add:1.2.9', 'drop:1.4.2'])
    expect(chosen.has('relabel:1.3.3')).toBe(false)
    expect(chosen.has('keep:1.1.2')).toBe(false)
  })

  it('annonce les garanties (documents conservés, validations préservées, audit)', () => {
    setup()
    expect(screen.getByText(/gardent leur validation/i)).toBeInTheDocument()
    expect(screen.getByText(/documents restent en place/i)).toBeInTheDocument()
    expect(screen.getByText(/journal d’audit/i)).toBeInTheDocument()
  })
})
