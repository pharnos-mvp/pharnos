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

test('< lg : la barre latérale passe en menu ☰ (tiroir) et navigue', async ({ page }) => {
  // Viewport mobile (< lg = 1024) : la barre latérale est masquée, un ☰ ouvre la nav en tiroir.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/catalogue')
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible()

  // Tiroir fermé : aucune « Navigation principale » dans l'arbre d'accessibilité (aside en display:none,
  // tiroir Radix démonté). Le bouton ☰ est lui visible.
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
  const burger = page.getByRole('button', { name: 'Ouvrir le menu' })
  await expect(burger).toBeVisible()

  // Ouverture → la nav primaire apparaît dans le tiroir ; clic d'un lien → navigation + fermeture.
  await burger.click()
  const drawerNav = page.getByRole('navigation', { name: 'Navigation principale' })
  await expect(drawerNav.getByRole('link', { name: 'CTD Workspace' })).toBeVisible()
  await drawerNav.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0)
})
