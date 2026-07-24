import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { partyId } from '@/features/catalogue/parties-repository'
import { db, type DossierRecord, type PartyRecord, type PartyRole } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { ShareDialog } from './ShareDialog'

// Pipeline d'envoi mocké : on teste le DESTINATAIRE (picker P3), pas le share (couvert ailleurs).
vi.mock('./share-send', () => ({
  sendCompiledDossier: vi.fn().mockResolvedValue({
    correspondence: { id: 'corr-1', recipientEmail: 'x@y.z' },
    url: 'https://app.pharnos.com/r/tok',
  }),
  resendCompiledDossier: vi.fn(),
  notifyRecipient: vi.fn().mockResolvedValue(true),
  suggestSharePassword: () => 'password123',
}))
vi.mock('@/features/catalogue/catalogue-sync', () => ({
  syncCatalogue: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { toast } from 'sonner'
import { sendCompiledDossier } from './share-send'

const ORG = 'test-org'

const party = (
  nom: string,
  roles: PartyRole[],
  contactEmail: string | null = null,
): PartyRecord => ({
  id: partyId(ORG, nom),
  orgId: ORG,
  nom,
  roles,
  pays: '',
  adresse: '',
  gmpCertificat: '',
  gmpExpiry: null,
  contactEmail,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
})

const dossier = {
  id: 'd1',
  orgId: ORG,
  productId: 'p1',
  productName: 'AMOXIPHAR 500',
  format: 'ctd',
  activity: 'new_ma',
  country: 'BJ',
  status: 'draft',
  tree: [],
  excludedDocIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
} as unknown as DossierRecord

function renderDialog() {
  render(
    <I18nProvider>
      <ShareDialog
        orgId={ORG}
        dossier={dossier}
        pdfBlob={new Blob(['pdf'])}
        senderEmail="expert@pharnos.com"
        onClose={() => {}}
      />
    </I18nProvider>,
  )
}

describe('ShareDialog — destinataire depuis la base des agences (P3)', () => {
  beforeEach(async () => {
    await Promise.all([db.parties.clear(), db.correspondences.clear(), db.outbox.clear()])
    vi.mocked(sendCompiledDossier).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('liste les agences (rôle agent) seulement ; en choisir une préremplit l’e-mail', async () => {
    await db.parties.bulkPut([
      party('Agence Bénin', ['agent'], 'contact@agence.bj'),
      party('PHARMAX', ['fabricant']), // autre rôle → PAS proposé
    ])
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'Agence Bénin — contact@agence.bj' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('option', { name: /PHARMAX/ })).not.toBeInTheDocument()

    await user.selectOptions(
      select,
      screen.getByRole('option', { name: 'Agence Bénin — contact@agence.bj' }),
    )
    expect(screen.getByLabelText('E-mail du correspondant')).toHaveValue('contact@agence.bj')
  })

  it('« ＋ Nouvelle agence » : crée la partie (rôle agent, pays du dossier, e-mail) puis envoie', async () => {
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouvelle agence/ }))
    await user.type(screen.getByLabelText('Nom de la nouvelle agence'), 'PharmaReg Bénin')
    await user.type(screen.getByLabelText('E-mail du correspondant'), 'contact@pharmareg.bj')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() =>
      expect(sendCompiledDossier).toHaveBeenCalledWith(
        expect.objectContaining({ recipientEmail: 'contact@pharmareg.bj' }),
      ),
    )
    await waitFor(async () =>
      // La capture au catalogue est asynchrone APRÈS l'envoi (best-effort).
      expect(await db.parties.get(partyId(ORG, 'PharmaReg Bénin'))).toMatchObject({
        roles: ['agent'],
        pays: 'Bénin', // dossier.country 'BJ' → libellé
        contactEmail: 'contact@pharmareg.bj',
      }),
    )
  })

  it('agence choisie SANS e-mail : l’e-mail saisi est enregistré sur sa fiche (complément, pas d’écrasement)', async () => {
    const agence = party('Agence Togo', ['agent'])
    await db.parties.put(agence)
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, await screen.findByRole('option', { name: 'Agence Togo' }))
    await user.type(screen.getByLabelText('E-mail du correspondant'), 'depots@agencetogo.tg')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(async () =>
      expect((await db.parties.get(agence.id))?.contactEmail).toBe('depots@agencetogo.tg'),
    )
  })

  it('agence AVEC e-mail : un e-mail modifié part à l’envoi mais n’écrase PAS la fiche', async () => {
    const agence = party('Agence CI', ['agent'], 'officiel@agenceci.ci')
    await db.parties.put(agence)
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(
      select,
      await screen.findByRole('option', { name: 'Agence CI — officiel@agenceci.ci' }),
    )
    const email = screen.getByLabelText('E-mail du correspondant')
    await user.clear(email)
    await user.type(email, 'perso@agenceci.ci')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() =>
      expect(sendCompiledDossier).toHaveBeenCalledWith(
        expect.objectContaining({ recipientEmail: 'perso@agenceci.ci' }),
      ),
    )
    expect((await db.parties.get(agence.id))?.contactEmail).toBe('officiel@agenceci.ci')
  })

  it('régression : saisie libre sans sélection envoie comme avant (aucune partie créée)', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.type(
      await screen.findByLabelText('E-mail du correspondant'),
      'libre@representant.com',
    )
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() =>
      expect(sendCompiledDossier).toHaveBeenCalledWith(
        expect.objectContaining({ recipientEmail: 'libre@representant.com' }),
      ),
    )
    expect(await db.parties.count()).toBe(0)
  })

  it('e-mail TAPÉ puis agence sans e-mail choisie : la saisie est conservée et enregistrée (en minuscules) sur la fiche', async () => {
    const agence = party('Agence Togo', ['agent'])
    await db.parties.put(agence)
    const user = userEvent.setup()
    renderDialog()

    // L'utilisateur tape d'abord l'adresse, PUIS retrouve l'agence dans la base.
    await user.type(await screen.findByLabelText('E-mail du correspondant'), 'Depots@AgenceTogo.TG')
    const select = screen.getByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, await screen.findByRole('option', { name: 'Agence Togo' }))
    expect(screen.getByLabelText('E-mail du correspondant')).toHaveValue('Depots@AgenceTogo.TG')

    await user.click(screen.getByRole('button', { name: 'Envoyer' }))
    await waitFor(async () =>
      // Normalisé comme la clé du fil (share-send stocke en minuscules).
      expect((await db.parties.get(agence.id))?.contactEmail).toBe('depots@agencetogo.tg'),
    )
  })

  it('échec de l’envoi → AUCUNE agence créée (capture uniquement après un envoi réussi)', async () => {
    vi.mocked(sendCompiledDossier).mockRejectedValueOnce(new Error('upload KO'))
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouvelle agence/ }))
    await user.type(screen.getByLabelText('Nom de la nouvelle agence'), 'PharmaReg Bénin')
    await user.type(screen.getByLabelText('E-mail du correspondant'), 'contact@pharmareg.bj')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(await db.parties.count()).toBe(0)
  })

  it('nom déjà connu (autre rôle) : annonce la réutilisation et FUSIONNE au lieu de dupliquer', async () => {
    await db.parties.put(party('PHARMAX', ['fabricant']))
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouvelle agence/ }))
    await user.type(screen.getByLabelText('Nom de la nouvelle agence'), 'PHARMAX')
    // L'UI ne promet PAS une création : elle annonce la fusion avec l'org existante.
    expect(await screen.findByText(/existe déjà/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('E-mail du correspondant'), 'depots@pharmax.ci')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(async () => {
      const merged = await db.parties.get(partyId(ORG, 'PHARMAX'))
      expect(merged?.roles).toEqual(['agent', 'fabricant'])
      expect(merged?.contactEmail).toBe('depots@pharmax.ci')
    })
    expect(await db.parties.count()).toBe(1)
  })

  it('« ＋ Nouvelle agence » sans nom → erreur et AUCUN envoi', async () => {
    const user = userEvent.setup()
    renderDialog()

    const select = await screen.findByLabelText('Destinataire (agence locale)')
    await user.selectOptions(select, screen.getByRole('option', { name: /Nouvelle agence/ }))
    await user.type(screen.getByLabelText('E-mail du correspondant'), 'contact@pharmareg.bj')
    await user.click(screen.getByRole('button', { name: 'Envoyer' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(sendCompiledDossier).not.toHaveBeenCalled()
  })
})
