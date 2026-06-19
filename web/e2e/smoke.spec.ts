import { expect, test } from '@playwright/test'

/**
 * Smoke : l'app démarre en mode local (sans backend) et atterrit sur le Catalogue,
 * avec la navigation principale accessible.
 */
test('démarre sur le Catalogue avec la navigation principale', async ({ page }) => {
  await page.goto('/')

  // La racine redirige vers /catalogue.
  await expect(page).toHaveURL(/\/catalogue$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible()

  // Navigation latérale présente (le pied de page reprend les mêmes libellés → on cible le
  // landmark « Navigation principale » pour lever l'ambiguïté du mode strict Playwright).
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(nav.getByRole('link', { name: 'CTD Workspace' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Tableau de bord' })).toBeVisible()

  // Indicateur de connectivité présent.
  await expect(page.getByRole('status')).toBeVisible()
})

test('navigue vers le Tableau de bord', async ({ page }) => {
  await page.goto('/catalogue')
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Tableau de bord' })
    .click()
  await expect(page).toHaveURL(/\/dashboard$/)
})
