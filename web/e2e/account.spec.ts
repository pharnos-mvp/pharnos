import { expect, test } from '@playwright/test'

/**
 * Profil — onglet « Informations professionnelles » (local-first, IndexedDB) :
 * le bouton Enregistrer (en haut) n'est actif qu'en cas de modification, puis se
 * redésactive une fois l'enregistrement effectué.
 */
test('Infos pro : Enregistrer actif uniquement si modifié', async ({ page }) => {
  await page.goto('/compte')
  await page.getByRole('button', { name: 'Informations professionnelles' }).click()

  const save = page.getByRole('button', { name: 'Enregistrer', exact: true })
  await expect(save).toBeDisabled()

  await page.getByLabel("Nom de l'entreprise").fill('Pharma SA')
  await expect(save).toBeEnabled()

  await save.click()
  // Après enregistrement, l'état redevient « non modifié » → bouton désactivé.
  await expect(save).toBeDisabled()
})
