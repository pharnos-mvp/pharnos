import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { I18nProvider } from '@/lib/I18nProvider'
import { listDossiers } from '@/features/workspace/dossier-repository'
import { BuilderWorkspace } from './BuilderWorkspace'
import { LOCAL_WORKSPACE_ID } from './local-workspace'

/**
 * Le chemin critique du lot B1, de bout en bout et SANS RÉSEAU : créer un dossier sur le poste,
 * puis voir l'arborescence officielle du Module 1 de son pays.
 *
 * Ce test garde deux promesses distinctes, et la seconde est la vraie :
 *  1. l'écran enchaîne (liste vide → formulaire → arborescence) ;
 *  2. le dossier est réellement ÉCRIT dans IndexedDB sous l'identité locale — c'est ce qui fait
 *     qu'il est encore là au prochain lancement. Un test qui ne vérifierait que l'affichage
 *     passerait au vert sur une application qui perd tout à la fermeture de l'onglet.
 */
function monter() {
  return render(
    <I18nProvider>
      <BuilderWorkspace />
    </I18nProvider>,
  )
}

describe('BuilderWorkspace — montage d’un dossier hors ligne', () => {
  beforeEach(async () => {
    await db.dossiers.clear()
    await db.outbox.clear()
  })

  it('crée un dossier sur le poste et affiche son arborescence Module 1', async () => {
    const user = userEvent.setup()
    monter()

    expect(await screen.findByText('Aucun dossier sur ce poste.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Nouveau dossier/ }))
    await user.type(screen.getByLabelText('Nom du produit'), 'Amoxicilline 500 mg')
    await user.selectOptions(screen.getByLabelText('Pays de dépôt'), 'SN')
    await user.click(screen.getByRole('button', { name: 'Créer le dossier' }))

    // L'écran a basculé sur le dossier…
    expect(await screen.findByRole('heading', { name: 'Amoxicilline 500 mg' })).toBeInTheDocument()
    // …et l'arborescence officielle est là, pas un squelette vide.
    await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(10))

    // La promesse qui compte : c'est écrit sur le poste, sous l'identité locale.
    const enBase = await listDossiers(LOCAL_WORKSPACE_ID)
    expect(enBase).toHaveLength(1)
    expect(enBase[0]).toMatchObject({
      productName: 'Amoxicilline 500 mg',
      country: 'SN',
      activity: 'new_ma',
      format: 'ctd',
    })
    expect(enBase[0]?.tree.length).toBeGreaterThan(0)
  })

  it('refuse de créer un dossier sans nom de produit', async () => {
    const user = userEvent.setup()
    monter()

    await user.click(await screen.findByRole('button', { name: /Nouveau dossier/ }))
    expect(screen.getByRole('button', { name: 'Créer le dossier' })).toBeDisabled()
    expect(await listDossiers(LOCAL_WORKSPACE_ID)).toHaveLength(0)
  })

  it('retrouve un dossier déjà présent au lancement suivant', async () => {
    // Simule le relancement : la base contient déjà un dossier, l'écran doit le lister sans que
    // rien n'ait été créé pendant cette session.
    const { createDossier } = await import('@/features/workspace/dossier-repository')
    await createDossier(LOCAL_WORKSPACE_ID, {
      productId: 'p-1',
      productName: 'Paracétamol 1 g',
      format: 'ctd',
      activity: 'new_ma',
      country: 'BJ',
    })

    monter()
    expect(await screen.findByText('Paracétamol 1 g')).toBeInTheDocument()
    expect(screen.queryByText('Aucun dossier sur ce poste.')).not.toBeInTheDocument()
  })
})
