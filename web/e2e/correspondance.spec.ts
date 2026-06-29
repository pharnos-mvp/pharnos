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
  // Wizard : le produit est créé à « Terminer » (sessions 2/3 = pièces, vides ici).
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page).toHaveURL(/\/catalogue$/)

  await page.goto('/workspace/nouveau')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(nom) }).click()
  // Pays cible : plus de défaut (#224) — il faut désormais choisir un pays avant de créer.
  await page.getByRole('combobox').filter({ hasText: 'Choisir un pays' }).click()
  await page.getByRole('option', { name: 'Bénin' }).click()
  // Assistant 3 étapes : Produit & marché → Opération (Nouvelle AMM par défaut) → Détails + création.
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Créer le dossier' }).click()
  await page.waitForURL(/\/workspace\/[^/]+\/roadmap$/)
  return nom
}

test('board Opérations : table dense + filtres procédure + statut « Brouillon » dérivé', async ({
  page,
}) => {
  const nom = await createDossier(page)
  await page.goto('/workspace')

  const group = page.getByRole('group', { name: 'Filtrer par procédure' })
  await expect(group).toBeVisible()
  await expect(group.getByRole('button', { name: /^Toutes · 1$/ })).toBeVisible()
  await expect(group.getByRole('button', { name: /^Enregistrement · 1$/ })).toBeVisible()

  // La ligne du dossier porte le statut « Brouillon » (dérivé : aucune correspondance).
  const row = page.getByRole('row', { name: new RegExp(nom) })
  await expect(row.getByText('Brouillon', { exact: true })).toBeVisible()

  // Filtre « Variation » (0 dossier) → table vide explicite.
  await group.getByRole('button', { name: /^Variation · 0$/ }).click()
  await expect(page.getByText('Aucun dossier pour ce filtre.')).toBeVisible()
})

test('panneau Correspondance : accessible depuis le bandeau du dossier (état vide)', async ({
  page,
}) => {
  const nom = await createDossier(page)
  await page.goto('/workspace')
  await page
    .getByRole('row', { name: new RegExp(nom) })
    .getByRole('link')
    .first()
    .click()
  // Clic ligne → aperçu, puis « Modifier » → CTD Builder (qui porte le bandeau Correspondance).
  await page.waitForURL(/\/workspace\/[^/]+\/apercu$/)
  await page.getByRole('link', { name: 'Modifier' }).click()
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
