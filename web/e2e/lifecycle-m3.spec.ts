import { expect, test, type Page } from '@playwright/test'

/**
 * Jalon M3 — Échantillons & Frais : la Roadmap rend les **conditions de soumission** (panneau
 * accordéon compact) + le **journal enrichi et tronqué**, dérivés du journal `lifecycle_events`.
 * Mode local (sans backend) : on crée un dossier réel par l'UI, puis on injecte en IndexedDB une
 * correspondance ACCEPTÉE (source des étapes amont) et des événements M3 — exactement les données
 * que la sync Dexie poserait. Sans rôle (mode local), le panneau est en LECTURE SEULE : on vérifie
 * le rendu dérivé, pas la saisie (couverte par les tests composants).
 */

async function createDossier(page: Page): Promise<string> {
  const nom = `M3test ${Date.now()}`
  await page.goto('/catalogue/nouveau')
  await page.getByLabel('Nom commercial').fill(nom)
  await page.getByLabel('DCI').fill('Substance X')
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page).toHaveURL(/\/catalogue$/)

  await page.goto('/workspace/nouveau')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(nom) }).click()
  await page.getByRole('combobox').filter({ hasText: 'Choisir un pays' }).click()
  await page.getByRole('option', { name: 'Bénin' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Créer le dossier' }).click()
  await page.waitForURL(/\/workspace\/[0-9a-f-]{36}$/)
  return page.url().split('/').pop() as string
}

/**
 * Injecte (IDB brut, même base que Dexie) une correspondance acceptée + des événements M3.
 * Horodatages POSTÉRIEURS à la création du dossier (relatifs à maintenant) : le journal est trié
 * par date réelle — des dates figées dans le passé placeraient « Montage créé » en fin de liste.
 */
async function seedLifecycle(page: Page, dossierId: string): Promise<void> {
  await page.evaluate(async (dId) => {
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
    const put = (store: string, value: unknown) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pharnos')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const dbx = open.result
          const tx = dbx.transaction(store, 'readwrite')
          tx.objectStore(store).put(value)
          tx.oncomplete = () => {
            dbx.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })

    // Correspondance ACCEPTÉE (étapes amont 1-3 franchies) — mêmes champs que la sync.
    await put('correspondences', {
      id: 'e2e-corr-1',
      orgId: 'local-org',
      dossierId: dId,
      productName: 'M3test',
      country: 'BJ',
      activity: 'new_ma',
      senderEmail: 'labo@ex.com',
      recipientEmail: 'agent@ex.com',
      note: null,
      pdfPath: 'x/module1.pdf',
      pdfSize: 1000,
      tokenHash: 'h',
      passwordHash: null,
      status: 'accepted',
      decidedAt: at(2),
      revokedAt: null,
      expiresAt: null,
      autoRevokeOnDecision: false,
      createdAt: at(1),
      updatedAt: at(2),
      deletedAt: null,
    })

    // Événements M3 : échantillons expédiés (LTA + pièce) + frais notifiés (montant) + dépôt.
    const ev = (over: Record<string, unknown>) => ({
      orgId: 'local-org',
      dossierId: dId,
      actorId: 'u1',
      actorEmail: 'labo@ex.com',
      payload: {},
      docRefs: [],
      ...over,
    })
    await put(
      'lifecycleEvents',
      ev({ id: 'e2e-ev-1', type: 'samples_requested', occurredAt: at(3), createdAt: at(3) }),
    )
    await put(
      'lifecycleEvents',
      ev({
        id: 'e2e-ev-2',
        type: 'samples_import_authorized',
        occurredAt: at(4),
        createdAt: at(4),
        docRefs: [
          {
            path: 'local-org/x/autorisation.pdf',
            name: 'autorisation.pdf',
            size: 10,
            mime: 'application/pdf',
          },
        ],
      }),
    )
    await put(
      'lifecycleEvents',
      ev({
        id: 'e2e-ev-3',
        type: 'fees_invoiced',
        occurredAt: at(5),
        createdAt: at(5),
        payload: { amount: 850000, currency: 'FCFA' },
      }),
    )
    await put(
      'lifecycleEvents',
      ev({
        id: 'e2e-ev-4',
        type: 'samples_shipped',
        occurredAt: at(6),
        createdAt: at(6),
        payload: { awb: 'DHL-4523' },
      }),
    )
    await put(
      'lifecycleEvents',
      ev({ id: 'e2e-ev-5', type: 'deposited', occurredAt: at(7), createdAt: at(7) }),
    )
  }, dossierId)
}

test('Roadmap M3 : conditions de soumission dérivées + journal enrichi et tronqué', async ({
  page,
}) => {
  const dossierId = await createDossier(page)
  await seedLifecycle(page, dossierId)

  await page.goto(`/workspace/${dossierId}/roadmap`)

  // Pipeline : Finalisation franchie (correspondance acceptée + deposited) → étape courante = Soumission.
  await expect(page.getByText('vous êtes ici')).toBeVisible()
  await expect(page.getByText(/Avancement 4 \/ 7 étapes/)).toBeVisible()

  // Panneau conditions : CTD remplie (deposited) → 1/3 ; montant des frais affiché sur la ligne.
  await expect(page.getByText('Conditions de soumission · 1 / 3')).toBeVisible()
  await expect(page.getByText(/850[\s\u00A0\u202F]000/).first()).toBeVisible()

  // Accordéon : la ligne Échantillons (1re actionnable) est dépliée → chaîne visible, « Expédiés ».
  await expect(page.getByText('Import autorisé')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Échantillons/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  // Pièce jointe consultable depuis la chaîne.
  await expect(page.getByRole('button', { name: /autorisation\.pdf/ }).first()).toBeVisible()
  // Mode local = aucun rôle gestionnaire → pas de bouton de saisie (lecture seule).
  await expect(page.getByRole('button', { name: 'Échantillons remis' })).toHaveCount(0)

  // Journal : > 6 entrées (montage + revue + décision + 5 événements) → tronqué, dépliable.
  const toggle = page.getByRole('button', { name: /Afficher les \d+ entrées précédentes/ })
  await expect(toggle).toBeVisible()
  await expect(page.getByText('Montage créé')).toHaveCount(0)
  await toggle.click()
  await expect(page.getByText('Montage créé')).toBeVisible()
  // Détail dérivé du payload (journalDetail) : LTA sur l'expédition.
  await expect(page.getByText(/LTA DHL-4523/)).toBeVisible()
})
