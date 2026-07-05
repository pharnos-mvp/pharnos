import { expect, test, type Page } from '@playwright/test'

/**
 * LOT 9 — Corbeille des brouillons (rétention GxP, docs/RETENTION-POLICY.md), en mode local
 * (sans backend) : le cycle supprimer → corbeille (compte à rebours de purge) → restaurer est
 * 100 % offline-first (Dexie), donc testable de bout en bout ici. La purge serveur (Edge
 * `retention-purge` + cron 0054) est couverte par pgTAP (plomberie) + smoke prod.
 */

async function createDraft(page: Page): Promise<string> {
  const nom = `Corbeille ${Date.now()}`
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
  return nom
}

test('corbeille : supprimer un brouillon → restaurer depuis la corbeille', async ({ page }) => {
  const nom = await createDraft(page)

  // Suppression depuis le board : dialogue avec motif (ALCOA) + copy de rétention 30 j.
  await page.goto('/workspace')
  await page
    .getByRole('row', { name: new RegExp(nom) })
    .first()
    .getByRole('button', { name: 'Supprimer le brouillon' })
    .click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('restaurable pendant 30 jours')
  await dialog.getByLabel('Motif (recommandé)').fill('doublon de recette')
  await dialog.getByRole('button', { name: 'Supprimer' }).click()

  // Toast avec action « Restaurer » (undo) — on le laisse expirer pour tester le chemin corbeille.
  const toast = page.locator('[data-sonner-toast]')
  await expect(toast).toContainText('corbeille')
  await expect(toast.getByRole('button', { name: 'Restaurer' })).toBeVisible()
  await expect(toast).toHaveCount(0, { timeout: 12_000 })

  // Vue Corbeille : pilule, note de politique de rétention, compte à rebours de purge.
  await page.getByRole('button', { name: /Corbeille · 1/ }).click()
  await expect(page.getByText('Politique de rétention')).toBeVisible()
  const row = page.getByRole('row', { name: new RegExp(nom) })
  await expect(row).toContainText(/dans 30 j/)

  // Restauration → retour automatique sur la vue Actifs, le dossier est de nouveau actif.
  await row.getByRole('button', { name: 'Restaurer le brouillon' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restaurer' }).click()
  await expect(page.getByRole('button', { name: /Corbeille/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: new RegExp(nom) })).toBeVisible()
})
