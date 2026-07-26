import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/lib/I18nProvider'
import { StructureEditor } from './AdminReferentiel'
import { currentMapOf, newDelta, prefillEntry, type DraftEntry } from './ref-draft'

/**
 * Le défaut M1 vivait DANS le composant : la liste de nœuds dérivait du format de la PREMIÈRE
 * ligne. Les tests de la fonction pure ne le verrouillent pas — ils passeraient encore si quelqu'un
 * réécrivait le câblage en `pickableScopes(country, entry.deltas[0], current)`. Ce test-ci le
 * verrouille, et lui seul.
 */
const entryWith = (deltas: Partial<ReturnType<typeof newDelta>>[]): DraftEntry => ({
  ...prefillEntry('SN', 'ctd_structure'),
  deltas: deltas.map((d) => ({ ...newDelta(), ...d })),
})

const renderEditor = (entry: DraftEntry) =>
  render(<StructureEditor entry={entry} onChange={() => {}} current={currentMapOf([])} />, {
    wrapper: I18nProvider,
  })

/** Le select « Nœud » de la n-ième ligne — repéré par son libellé, jamais par son rang. */
const nodeSelect = (index: number) => screen.getAllByLabelText(/^(Nœud|Node)$/)[index]!

/** Numéros offerts par ce select (la valeur porte `format|numéro`). */
const offered = (index: number) => {
  return within(nodeSelect(index))
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean)
}

describe('M1 — chaque ligne offre les nœuds de SA portée', () => {
  it('une ligne CTD et une ligne eCTD n’offrent PAS la même liste', () => {
    renderEditor(
      entryWith([
        { kind: 'relabel', format: 'ctd' },
        { kind: 'relabel', format: 'ectd' },
      ]),
    )
    const ctd = offered(0)
    const ectd = offered(1)
    expect(ctd.length).toBeGreaterThan(5)
    expect(ectd.length).toBeGreaterThan(5)
    expect(ctd).not.toEqual(ectd)
    // Le format voyage avec le numéro : sans cela, 1.2.6 est ambigu entre deux arbres.
    expect(ctd.every((v) => v.startsWith('ctd|'))).toBe(true)
    expect(ectd.every((v) => v.startsWith('ectd|'))).toBe(true)
  })

  it('une ligne « les deux formats » GROUPE les arbres au lieu de les fondre (M-A)', () => {
    renderEditor(entryWith([{ kind: 'relabel', format: '' }]))
    const groups = nodeSelect(0).querySelectorAll('optgroup')
    expect(groups.length).toBe(2)
    expect([...groups].map((g) => g.getAttribute('label'))).toEqual(['CTD (PDF)', 'eCTD v4'])
    // Un numéro homonyme apparaît DEUX fois, une par arbre, avec le libellé de chacun.
    const values = offered(0)
    expect(values.filter((v) => v.endsWith('|1.2.6'))).toHaveLength(2)
  })

  it('un retrait n’offre pas les deux premiers niveaux, et le dit', () => {
    renderEditor(entryWith([{ kind: 'remove', format: 'ctd' }]))
    expect(offered(0).every((v) => v.split('|')[1]!.split('.').length >= 3)).toBe(true)
    expect(screen.getByText(/ossature du Module 1/)).toBeInTheDocument()
  })
})
