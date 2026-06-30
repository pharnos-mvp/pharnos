// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Combobox, type ComboboxItem } from './combobox'

const ITEMS: ComboboxItem[] = [
  { value: 'a', label: 'Amoxicilline', keywords: 'antibiotique' },
  { value: 'b', label: 'Paracétamol' },
  { value: 'c', label: 'Métronidazole' },
]

function setup(value = '') {
  const onChange = vi.fn()
  render(
    <Combobox
      value={value}
      onChange={onChange}
      items={ITEMS}
      ariaLabel="Produit"
      emptyText="Aucun produit."
    />,
  )
  return { onChange, input: screen.getByRole('combobox') }
}

describe('Combobox', () => {
  it('ouvre la liste complète au clic (comme un select)', () => {
    const { input } = setup()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('filtre par libellé à la frappe', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'para' } })
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(1)
    expect(opts[0]).toHaveTextContent('Paracétamol')
  })

  it('filtre aussi par mot-clé (keywords)', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'antibio' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option')).toHaveTextContent('Amoxicilline')
  })

  it('sélectionne au clic et renvoie la valeur', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    fireEvent.click(screen.getByText('Métronidazole'))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('navigation clavier ↓ puis Entrée sélectionne', () => {
    const { input, onChange } = setup()
    fireEvent.click(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // descend sur la 2e option
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('affiche l’état vide quand rien ne correspond', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Aucun produit.')).toBeInTheDocument()
  })

  it('expose les attributs ARIA de combobox', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })
})
