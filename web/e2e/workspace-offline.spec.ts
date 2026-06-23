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
  // Pays cible : plus de défaut (#224) — il faut désormais choisir un pays avant de créer.
  await page.getByRole('combobox').filter({ hasText: 'Choisir un pays' }).click()
  await page.getByRole('option', { name: 'Bénin' }).click()
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

test('< lg : montage en disposition tablette (actions dans la barre d’onglets + pastilles + validation flottante)', async ({
  page,
}) => {
  // Refonte responsive : sous lg (1024), la page de montage bascule en barre d'onglets (avec les
  // actions du document à DROITE, en version compacte) + carte document + panneau de validation
  // flottant + pastilles de sections (l'arborescence et l'en-tête horizontal desktop ne sont PAS
  // montés). Vérifié dans un vrai navigateur (viewport honoré), ce que le preview headless 0×0 ne
  // permet pas. [[preview-env-limitations]]
  await page.setViewportSize({ width: 390, height: 844 })
  const nom = await createDossier(page)
  await page.goto('/workspace')
  await page.locator('li', { hasText: nom }).first().getByRole('link').first().click()
  await page.waitForURL(/\/workspace\/[^/]+$/)

  // Actions du document = barre d'outils HORIZONTALE dans la barre d'onglets (≠ ancien rail vertical).
  const actions = page.getByRole('toolbar', { name: 'Actions du document' })
  await expect(actions).toBeVisible()
  await expect(actions).not.toHaveAttribute('aria-orientation', 'vertical')
  await expect(actions.getByRole('button').first()).toBeVisible() // boutons d'action compacts

  // Arborescence latérale desktop NON montée < lg ; navigation = pastilles de sections.
  await expect(page.getByRole('navigation', { name: 'Structure du dossier' })).toHaveCount(0)
  const sections = page.getByRole('navigation', { name: 'Sections du dossier' })
  await expect(sections).toBeVisible()

  // Panneau de validation flottant : donut de complétude (image « N% »).
  await expect(page.getByRole('img', { name: /%$/ }).first()).toBeVisible()

  // Une pastille sélectionne sa section (l'identité de la carte document se met à jour).
  await sections.getByRole('button', { name: /^1\.0 / }).click()
  await expect(page.getByRole('heading', { level: 2 })).toContainText('1.0')
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
