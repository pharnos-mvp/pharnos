import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Form } from '@/components/ui/form'
import { OrgContext } from '@/features/org/org-context'
import { mahPartyLimit } from '@/features/org/use-org-plan'
import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrgBlock } from './product-fields'
import { EMPTY_PRODUCT, type ProductFormValues, type ProductInput } from './types'

// Plan piloté par test (le vrai `useOrgPlan` = react-query + Supabase). `mahPartyLimit` reste RÉEL.
let mockPlan = 'business'
vi.mock('@/features/org/use-org-plan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/org/use-org-plan')>()
  return { ...actual, useOrgPlan: () => ({ data: { plan: mockPlan } }) }
})
// `toast` mocké pour asserter l'upsell sans rendre de portail sonner.
vi.mock('sonner', () => ({ toast: vi.fn() }))
import { toast } from 'sonner'

const ORG = 'test-org'

const party = (id: string, nom: string, roles: PartyRole[], adresse = ''): PartyRecord => ({
  id,
  orgId: ORG,
  nom,
  roles,
  pays: '',
  adresse,
  gmpCertificat: '',
  gmpExpiry: null,
  contactEmail: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
})

/** Rend `OrgBlock` dans un vrai form RHF ; expose les valeurs via un espion de rendu. */
function Harness({
  onValues,
  defaults,
}: {
  onValues: (v: ProductFormValues) => void
  defaults?: Partial<ProductFormValues>
}) {
  const form = useForm<ProductInput, unknown, ProductFormValues>({
    defaultValues: { ...EMPTY_PRODUCT, ...defaults },
  })
  onValues(form.watch() as ProductFormValues)
  return (
    <Form {...form}>
      <OrgBlock
        form={form}
        title="Titulaire d'AMM"
        nameField="titulaire"
        addressField="titulaireAdresse"
      />
    </Form>
  )
}

function renderBlock(defaults?: Partial<ProductFormValues>) {
  const values: { current: ProductFormValues } = { current: EMPTY_PRODUCT }
  render(
    <I18nProvider>
      <OrgContext.Provider value={ORG}>
        <MemoryRouter>
          <Harness onValues={(v) => (values.current = v)} defaults={defaults} />
        </MemoryRouter>
      </OrgContext.Provider>
    </I18nProvider>,
  )
  return values
}

describe('OrgBlock — choisir ou créer', () => {
  beforeEach(async () => {
    await db.parties.clear()
    mockPlan = 'business' // par défaut : pas de gate (agence illimitée)
    vi.mocked(toast).mockClear()
  })

  it('aucune org du rôle → saisie libre directe (nom éditable, pas de sélecteur)', async () => {
    renderBlock()
    // Le champ Nom est un input texte (pas un combobox/select).
    const nom = await screen.findByLabelText('Nom')
    expect(nom.tagName).toBe('INPUT')
  })

  it('des orgs existent → sélecteur ; choisir remplit nom + adresse', async () => {
    await db.parties.bulkPut([
      party('p1', 'KESHAVLAL VAJECHAND', ['titulaire'], 'Mumbai 400023'),
      party('p2', 'ABARIS', ['fabricant']), // autre rôle → PAS proposé pour le titulaire
    ])
    const user = userEvent.setup()
    const values = renderBlock()

    // Le sélecteur n'expose QUE les titulaires (+ « Nouveau »), pas le fabricant.
    const select = await screen.findByLabelText("Titulaire d'AMM")
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'KESHAVLAL VAJECHAND' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ABARIS' })).not.toBeInTheDocument()

    await user.selectOptions(select, 'KESHAVLAL VAJECHAND')
    await waitFor(() => {
      expect(values.current.titulaire).toBe('KESHAVLAL VAJECHAND')
      expect(values.current.titulaireAdresse).toBe('Mumbai 400023')
    })
  })

  it('« Nouveau » bascule en saisie libre', async () => {
    await db.parties.bulkPut([party('p1', 'KESHAVLAL', ['titulaire'], 'Mumbai')])
    const user = userEvent.setup()
    renderBlock()

    const select = await screen.findByLabelText("Titulaire d'AMM")
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouveau/ }))
    // Le champ Nom redevient un input libre.
    await waitFor(() => expect(screen.getByLabelText('Nom').tagName).toBe('INPUT'))
  })

  it('édition d’un produit dont le titulaire est une org connue → sélecteur pré-sélectionné', async () => {
    await db.parties.bulkPut([party('p1', 'KESHAVLAL', ['titulaire'], 'Mumbai')])
    renderBlock({ titulaire: 'KESHAVLAL', titulaireAdresse: 'Mumbai' })
    const select = (await screen.findByLabelText("Titulaire d'AMM")) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('KESHAVLAL'))
  })

  it('GATE : au plafond MAH (plan Free, 1 titulaire), « Nouveau » propose l’upsell au lieu de créer', async () => {
    mockPlan = 'free' // 1 MAH inclus
    await db.parties.bulkPut([party('p1', 'KESHAVLAL', ['titulaire'], 'Mumbai')])
    const user = userEvent.setup()
    renderBlock()

    const select = await screen.findByLabelText("Titulaire d'AMM")
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouveau/ }))

    // Upsell déclenché, ET on NE bascule PAS en saisie libre (le champ reste un sélecteur).
    expect(toast).toHaveBeenCalled()
    expect(screen.getByLabelText("Titulaire d'AMM").tagName).toBe('SELECT')
  })

  it('GATE : le FABRICANT n’est jamais gaté (plan Free, 1 fabricant)', async () => {
    mockPlan = 'free'
    await db.parties.bulkPut([party('p1', 'PHARMAX', ['fabricant'], 'Mumbai')])
    const user = userEvent.setup()
    render(
      <I18nProvider>
        <OrgContext.Provider value={ORG}>
          <MemoryRouter>
            <FabHarness />
          </MemoryRouter>
        </OrgContext.Provider>
      </I18nProvider>,
    )
    const select = await screen.findByLabelText('Fabricant')
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouveau/ }))
    // Pas d'upsell : bascule directe en saisie libre.
    expect(toast).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByLabelText('Nom').tagName).toBe('INPUT'))
  })
})

describe('mahPartyLimit (plafond MAH par plan)', () => {
  it('Free/Pro/Team = 1 · Business/Entreprise = illimité', () => {
    expect(mahPartyLimit('free')).toBe(1)
    expect(mahPartyLimit('pro')).toBe(1)
    expect(mahPartyLimit('team')).toBe(1)
    expect(mahPartyLimit('business')).toBe(Infinity)
    expect(mahPartyLimit('enterprise')).toBe(Infinity)
  })
})

/** Variante de `Harness` ciblant le champ Fabricant (pour le test de non-gating). */
function FabHarness() {
  const form = useForm<ProductInput, unknown, ProductFormValues>({ defaultValues: EMPTY_PRODUCT })
  return (
    <Form {...form}>
      <OrgBlock
        form={form}
        title="Fabricant"
        nameField="fabricant"
        addressField="fabricantAdresse"
      />
    </Form>
  )
}
