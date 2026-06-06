import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { OrgContext } from '@/features/org/org-context'
import { db } from '@/lib/db'
import { CataloguePage } from './CataloguePage'

beforeEach(async () => {
  await db.products.clear()
})

describe('CataloguePage', () => {
  it("affiche l'état vide quand aucun produit n'est enregistré", async () => {
    render(
      <OrgContext.Provider value="test-org">
        <MemoryRouter>
          <CataloguePage />
        </MemoryRouter>
      </OrgContext.Provider>,
    )

    expect(await screen.findByText('Aucun produit')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Nouveau produit/i }).length).toBeGreaterThan(0)
  })
})
