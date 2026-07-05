import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Accessibilité (WCAG 2.0/2.1 A & AA) sur les pages cœur, via axe-core.
 * On bloque sur les violations d'impact `serious`/`critical` (barre forte et stable) ;
 * les violations mineures/modérées sont remontées en info dans le rapport.
 */
const PAGES = [
  { path: '/catalogue', name: 'Catalogue' },
  { path: '/workspace', name: 'CTD Workspace' },
  { path: '/dashboard', name: 'Tableau de bord' },
  { path: '/compte', name: 'Compte' },
] as const

for (const { path, name } of PAGES) {
  test(`a11y — aucune violation serious/critical : ${name}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    const summary = blocking
      .map((v) => `• ${v.id} (${v.impact}, ${v.nodes.length} nœud(s)) — ${v.help}`)
      .join('\n')
    expect(blocking, `Violations a11y bloquantes sur ${name} :\n${summary}`).toEqual([])
  })
}

// Thème SOMBRE — verrouille le fix token LOT 8 (pilule active `bg-info text-white` : 3,75:1 → 4,63:1
// avec `--info` #1f6feb). Une seule page suffit : /compte porte le rail de pilules + badges + CTA.
test('a11y — thème sombre, aucune violation serious/critical : Compte', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.goto('/compte')
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.waitForLoadState('networkidle')

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  const summary = blocking
    .map((v) => `• ${v.id} (${v.impact}, ${v.nodes.length} nœud(s)) — ${v.help}`)
    .join('\n')
  expect(blocking, `Violations a11y bloquantes sur Compte (sombre) :\n${summary}`).toEqual([])
})
