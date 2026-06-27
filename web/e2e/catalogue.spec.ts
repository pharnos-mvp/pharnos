import { expect, test } from '@playwright/test'

/**
 * Flux cœur Catalogue : créer un produit puis le retrouver dans la liste.
 * Tout est local (IndexedDB) — aucune dépendance réseau.
 */
test('crée un produit et le retrouve dans le catalogue', async ({ page }) => {
  const nom = `Doliprane E2E ${Date.now()}`

  await page.goto('/catalogue')
  await page.getByRole('link', { name: 'Nouveau produit' }).first().click()
  await expect(page).toHaveURL(/\/catalogue\/nouveau$/)

  await page.getByLabel('Nom commercial').fill(nom)
  await page.getByLabel('DCI').fill('Paracétamol')
  await page.getByRole('button', { name: 'Enregistrer le produit' }).click()

  // Retour à la liste : le produit est visible (carte-ligne premium — le nom est un
  // lien vers la fiche cockpit, accessible name = nom exact).
  await expect(page).toHaveURL(/\/catalogue$/)
  await expect(page.getByRole('link', { name: nom, exact: true })).toBeVisible()
})
