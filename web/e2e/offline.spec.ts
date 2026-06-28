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
  await expect(page.getByRole('heading', { level: 1, name: 'Produits' })).toBeVisible()

  // Attendre que le service worker soit actif (install/précache terminés).
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })

  // Couper le réseau et recharger : l'app doit se servir entièrement du cache.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Produits' })).toBeVisible()

  // La navigation client (route lazy précachée) fonctionne toujours hors-ligne.
  await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name: 'Tableau de bord' })
    .click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  await context.setOffline(false)
})

/**
 * Le worker pdf.js (~1,2 Mo) est PRÉCACHÉ par le SW : l'aperçu PDF hors-ligne ne dépend
 * d'aucun warm-up (le runtime cache de T9 s'est avéré trop fragile en recette — rollback).
 */
test('worker pdf.js : présent dans le précache du service worker', async ({ page }) => {
  await page.goto('/catalogue')
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })

  const precachedWorker = await page.evaluate(async () => {
    const names = await caches.keys()
    const precacheName = names.find((n) => n.includes('precache'))
    if (!precacheName) return []
    const keys = await (await caches.open(precacheName)).keys()
    return keys.map((k) => k.url).filter((u) => u.includes('pdf.worker') && u.endsWith('.mjs'))
  })
  expect(precachedWorker.length).toBeGreaterThan(0)
})
