import { expect, test } from '@playwright/test'

/**
 * Headline DoD : l'app fonctionne **hors-ligne** après un premier chargement.
 * Le service worker PWA précache l'app-shell et les chunks ; une fois hors-ligne,
 * un rechargement complet doit toujours rendre l'app, et la navigation client doit marcher.
 */
test('fonctionne hors-ligne après le premier chargement (précache PWA)', async ({
  page,
  context,
}) => {
  await page.goto('/catalogue')
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible()

  // Attendre que le service worker soit actif (install/précache terminés).
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })

  // Couper le réseau et recharger : l'app doit se servir entièrement du cache.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible()

  // La navigation client (route lazy précachée) fonctionne toujours hors-ligne.
  await page.getByRole('link', { name: 'Tableau de bord' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await context.setOffline(false)
})

/**
 * T9 (PLAN-V2) : le worker pdf.js (~1,2 Mo) n'est PLUS précaché (installation SW allégée) —
 * il est posé en runtime cache (CacheFirst) par le warm-up de la page workspace, en ligne.
 * Garanties vérifiées : précache sans .mjs + worker en cache après l'ouverture d'un dossier
 * (il sera donc servi hors-ligne pour les aperçus PDF).
 */
test('worker pdf.js : hors précache, mis en cache par le warm-up du workspace', async ({
  page,
}) => {
  await page.goto('/catalogue')
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })

  // 1) Le précache Workbox ne contient AUCUN .mjs (le worker pesait ~1/3 de l'installation).
  const precachedMjs = await page.evaluate(async () => {
    const names = await caches.keys()
    const precacheName = names.find((n) => n.includes('precache'))
    if (!precacheName) return ['precache introuvable']
    const keys = await (await caches.open(precacheName)).keys()
    return keys.map((k) => k.url).filter((u) => u.endsWith('.mjs'))
  })
  expect(precachedMjs).toEqual([])

  // 2) Créer produit + dossier puis ouvrir le workspace → warm-up (~2 s) → fetch du worker.
  const nom = `Warmup E2E ${Date.now()}`
  await page.goto('/catalogue/nouveau')
  await page.getByLabel('Nom commercial').fill(nom)
  await page.getByLabel('DCI').fill('Paracétamol')
  await page.getByRole('button', { name: 'Enregistrer le produit' }).click()
  await expect(page).toHaveURL(/\/catalogue$/)

  await page.goto('/workspace/nouveau')
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(nom) }).click()
  await page.getByRole('button', { name: 'Créer le dossier' }).click()
  await expect(page).toHaveURL(/\/workspace\/(?!nouveau).+/)

  // 3) Le worker est dans le runtime cache « pdf-worker » → servi hors-ligne (CacheFirst).
  await page.waitForFunction(
    async () => {
      const cache = await caches.open('pdf-worker')
      return (await cache.keys()).some((k) => k.url.includes('pdf.worker'))
    },
    { timeout: 15_000 },
  )
})
