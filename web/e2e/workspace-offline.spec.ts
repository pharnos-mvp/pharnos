import { expect, test, type Page } from '@playwright/test'

/**
 * Gate N2-b — le **code-split** du workspace (TipTap `RichTextEditor` + `TemplateFillForm` passés
 * en `React.lazy`) ne doit RIEN casser hors-ligne. Deux garanties, en mode local (sans backend) :
 *   1. la route workspace (chunk `DossierWorkspacePage-*`, désormais sans l'éditeur) se rend
 *      toujours après une coupure réseau (montage d'un dossier réel → reload offline) ;
 *   2. les chunks lazy de l'éditeur et du formulaire sont **précachés** par le service worker
 *      → disponibles hors-ligne (même garantie que le worker pdf.js, cf. offline.spec).
 * Le parcours fonctionnel complet (édition TipTap → compile → correspondance) reste couvert par
 * la recette navigateur en prod (l'Edge `share` n'est pas joignable en mode local).
 */

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })
}

async function createDossier(page: Page): Promise<string> {
  const nom = `Splittest ${Date.now()}`
  await page.goto('/catalogue/nouveau')
  await page.getByLabel('Nom commercial').fill(nom)
  await page.getByLabel('DCI').fill('Substance X')
  await page.getByRole('button', { name: 'Enregistrer le produit' }).click()
  await expect(page).toHaveURL(/\/catalogue$/)

  await page.goto('/workspace/nouveau')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(nom) }).click()
  await page.getByRole('button', { name: 'Créer le dossier' }).click()
  await page.waitForURL(/\/workspace\/[^/]+\/roadmap$/)
  return nom
}

test('montage : la route workspace (code-splittée) se rend hors-ligne après précache', async ({
  page,
  context,
}) => {
  const nom = await createDossier(page)

  // Vue de montage du dossier (/workspace/:id) — le chunk DossierWorkspacePage est chargé.
  await page.goto('/workspace')
  await page.locator('li', { hasText: nom }).first().getByRole('link').first().click()
  await page.waitForURL(/\/workspace\/[^/]+$/)
  const corrButton = page.getByRole('banner').getByRole('button', { name: 'Correspondance' })
  await expect(corrButton).toBeVisible()

  await waitForServiceWorker(page)

  // Réseau coupé + rechargement complet : le chunk de route est servi depuis le précache,
  // le dossier (Dexie) est lu localement → la vue de montage se rend toujours.
  await context.setOffline(true)
  await page.reload()
  await expect(corrButton).toBeVisible()

  await context.setOffline(false)
})

test('code-split : les chunks éditeur (TipTap) et formulaire sont précachés (offline-safe)', async ({
  page,
}) => {
  await page.goto('/catalogue')
  await waitForServiceWorker(page)

  const precached = await page.evaluate(async () => {
    const names = await caches.keys()
    const precacheName = names.find((n) => n.includes('precache'))
    if (!precacheName) return []
    const keys = await (await caches.open(precacheName)).keys()
    return keys.map((k) => k.url)
  })

  // Les imports dynamiques `./RichTextEditor` et `./components/TemplateFillForm` produisent des
  // chunks nommés RichTextEditor-*.js / TemplateFillForm-*.js, inclus dans le précache (globPatterns
  // **/*.js) → l'éditeur reste montable hors-ligne malgré le lazy-loading.
  expect(precached.some((u) => /\/RichTextEditor-[^/]*\.js$/.test(u))).toBe(true)
  expect(precached.some((u) => /\/TemplateFillForm-[^/]*\.js$/.test(u))).toBe(true)
})
