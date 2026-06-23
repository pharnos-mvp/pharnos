import { expect, test, type Page } from '@playwright/test'

/**
 * Correspondance (jalon H) — vérifiable en mode local (sans backend) :
 *   • la home Workspace groupe les dossiers par état (pills + badge « Draft » dérivé) ;
 *   • le panneau Correspondance du dossier s'ouvre (état vide) ;
 *   • la page publique `/r/{token}` rend HORS app-shell (aucune auth) avec une erreur propre
 *     quand le backend est injoignable.
 * Le flux complet token → review → décision passe par l'Edge `share` (pgTAP + recette prod).
 */

async function createDossier(page: Page): Promise<string> {
  const nom = `Corrtest ${Date.now()}`
  await page.goto('/catalogue/nouveau')
  await page.getByLabel('Nom commercial').fill(nom)
  await page.getByLabel('DCI').fill('Substance X')
  await page.getByRole('button', { name: 'Enregistrer le produit' }).click()
  await expect(page).toHaveURL(/\/catalogue$/)

  await page.goto('/workspace/nouveau')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(nom) }).click()
  // Pays cible : plus de défaut (#224) — il faut désormais choisir un pays avant de créer.
  await page.getByRole('combobox').filter({ hasText: 'Choisir un pays' }).click()
  await page.getByRole('option', { name: 'Bénin' }).click()
  await page.getByRole('button', { name: 'Créer le dossier' }).click()
  await page.waitForURL(/\/workspace\/[^/]+\/roadmap$/)
  return nom
}

test('home Workspace : dossiers groupés par état, badge « Draft » dérivé', async ({ page }) => {
  const nom = await createDossier(page)
  await page.goto('/workspace')

  const group = page.getByRole('group', { name: 'Filtrer par état' })
  await expect(group).toBeVisible()
  await expect(group.getByRole('button', { name: /^Tous · 1$/ })).toBeVisible()
  await expect(group.getByRole('button', { name: /^Draft · 1$/ })).toBeVisible()
  await expect(group.getByRole('button', { name: /^En review · 0$/ })).toBeVisible()

  const card = page.locator('li', { hasText: nom }).first()
  await expect(card.getByText('Draft', { exact: true })).toBeVisible()

  // Filtre « Rejeté » : état vide explicite.
  await group.getByRole('button', { name: /^Rejeté · 0$/ }).click()
  await expect(page.getByText('Aucun dossier « Rejeté »')).toBeVisible()
})

test('panneau Correspondance : accessible depuis le bandeau du dossier (état vide)', async ({
  page,
}) => {
  const nom = await createDossier(page)
  await page.goto('/workspace')
  await page.locator('li', { hasText: nom }).first().getByRole('link').first().click()
  await page.waitForURL(/\/workspace\/[^/]+$/)

  // Banner uniquement : l'arborescence du dossier contient aussi « 1.1 Correspondance ».
  await page.getByRole('banner').getByRole('button', { name: 'Correspondance' }).click()
  await expect(page.getByRole('dialog')).toContainText('Aucun envoi pour ce dossier')
})

test('page publique /r/{token} : hors app-shell, erreur propre sans backend', async ({ page }) => {
  await page.goto(`/r/${'A'.repeat(43)}`)

  // Brandée Pharnos, SANS la navigation de l'app (pas d'auth, pas d'app-shell).
  await expect(page.getByText('Review de dossier réglementaire')).toBeVisible()
  await expect(page.getByRole('link', { name: 'CTD Workspace' })).toHaveCount(0)

  // Sans backend configuré (mode local), l'écran d'erreur est propre et lisible.
  await expect(page.getByText('Erreur du service — réessayez dans un instant.')).toBeVisible()
})
