import { expect, test, type Page } from '@playwright/test'

/**
 * Jalon M4 — Boucle Décision : après un « Renvoyer en revue », le `status` mutable de la
 * correspondance revient à `in_review` (l'étape dérivée repart à Revue) MAIS la décision
 * précédente reste TRACÉE au journal via le fil immuable (`kind: 'decision'`).
 * Mode local (sans backend) : dossier réel créé par l'UI, puis injection IDB brute de l'état
 * post-renvoi — exactement les données que la sync Dexie poserait. Sans rôle (mode local), le
 * bouton « Renvoyer en revue » est réservé aux gestionnaires (couvert par les tests composants) ;
 * ici on vérifie la DÉRIVATION rendue (boucle visible + retour à Revue).
 */

async function createDossier(page: Page): Promise<string> {
  const nom = `M4test ${Date.now()}`
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

/** État POST-« Renvoyer en revue » : correspondance in_review + décision passée dans le fil. */
async function seedReopenedReview(page: Page, dossierId: string): Promise<void> {
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

    // Correspondance ROUVERTE (status remis à in_review, décision levée, lien ré-armé).
    await put('correspondences', {
      id: 'e2e-corr-m4',
      orgId: 'local-org',
      dossierId: dId,
      productName: 'M4test',
      country: 'BJ',
      activity: 'new_ma',
      senderEmail: 'labo@ex.com',
      recipientEmail: 'agent@ex.com',
      note: null,
      pdfPath: 'x/module1.pdf',
      pdfSize: 1000,
      tokenHash: 'h',
      passwordHash: null,
      status: 'in_review',
      decidedAt: null,
      revokedAt: null,
      expiresAt: null,
      autoRevokeOnDecision: true,
      createdAt: at(1),
      updatedAt: at(3),
      deletedAt: null,
    })

    // La décision précédente vit dans le FIL (append-only) — source du journal multi-cycles.
    await put('correspondenceMessages', {
      id: 'e2e-msg-decision',
      orgId: 'local-org',
      correspondenceId: 'e2e-corr-m4',
      author: 'recipient',
      authorLabel: 'agent@ex.com',
      kind: 'decision',
      decision: 'suspended',
      body: 'Échantillons manquants.',
      attachments: [],
      createdAt: at(2),
    })
  }, dossierId)
}

test('Roadmap M4 : après renvoi en revue, la suspension reste tracée et l’étape revient à Revue', async ({
  page,
}) => {
  const dossierId = await createDossier(page)
  await seedReopenedReview(page, dossierId)

  await page.goto(`/workspace/${dossierId}/roadmap`)

  // Étape courante = Revue (le status muté in_review ramène la dérivation en amont)…
  await expect(page.getByText('vous êtes ici')).toBeVisible()
  await expect(page.getByText(/Avancement 1 \/ 7 étapes/)).toBeVisible()
  await expect(page.getByText('En revue').first()).toBeVisible()

  // …MAIS la boucle est VISIBLE : la décision précédente reste tracée au journal (fil immuable).
  await expect(page.getByText('Complément requis')).toBeVisible()
  await expect(page.getByText('Envoyé en revue à l’agent local')).toBeVisible()
})
