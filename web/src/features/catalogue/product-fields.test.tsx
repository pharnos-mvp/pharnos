import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it } from 'vitest'

import { Form } from '@/components/ui/form'
import { OrgContext } from '@/features/org/org-context'
import { db, type PartyRecord, type PartyRole } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { OrgBlock } from './product-fields'
import { EMPTY_PRODUCT, type ProductFormValues, type ProductInput } from './types'

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
        <Harness onValues={(v) => (values.current = v)} defaults={defaults} />
      </OrgContext.Provider>
    </I18nProvider>,
  )
  return values
}

describe('OrgBlock — choisir ou créer', () => {
  beforeEach(async () => {
    await db.parties.clear()
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
})
