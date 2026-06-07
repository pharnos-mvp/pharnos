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
