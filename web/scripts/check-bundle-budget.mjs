// Garde-fou de performance : vérifie la taille (gzip) du bundle après `npm run build`.
// But : empêcher une régression silencieuse du poids de l'app-shell (TTI). Exécuté en CI.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const ASSETS = path.resolve(import.meta.dirname, '../dist/assets')

// Budgets (gzip) en kilo-octets.
const BUDGET = {
  // Entrée index-*.js = JS exécuté au boot. **Gate déterministe de perf** : on cape ce chunk
  // pour borner le TBT (le score Lighthouse mobile dépend surtout du temps d'exécution JS au
  // démarrage). Resserré 175→135 après le travail FCP/LCP (squelette inline + eager /catalogue).
  entryJs: 135,
  totalCss: 60, // CSS total
}

const gzipKB = (buf) => gzipSync(buf, { level: 9 }).length / 1024

let files
try {
  files = readdirSync(ASSETS)
} catch {
  console.error(`✗ Dossier introuvable : ${ASSETS} — lance \`npm run build\` d'abord.`)
  process.exit(1)
}

const sizeOf = (f) => gzipKB(readFileSync(path.join(ASSETS, f)))
const js = files.filter((f) => f.endsWith('.js'))
const css = files.filter((f) => f.endsWith('.css'))

const entry = js.find((f) => /^index-.*\.js$/.test(f))
if (!entry) {
  console.error("✗ Chunk d'entrée index-*.js introuvable dans dist/assets.")
  process.exit(1)
}

const entryKB = sizeOf(entry)
const totalCssKB = css.reduce((sum, f) => sum + sizeOf(f), 0)

console.log('Chunks JS (gzip), du plus lourd au plus léger :')
for (const { f, kb } of js.map((f) => ({ f, kb: sizeOf(f) })).sort((a, b) => b.kb - a.kb)) {
  console.log(`  ${kb.toFixed(1).padStart(7)} Ko  ${f}`)
}
console.log(`CSS total (gzip) : ${totalCssKB.toFixed(1)} Ko`)

const checks = [
  { name: `entrée ${entry}`, value: entryKB, budget: BUDGET.entryJs },
  { name: 'CSS total', value: totalCssKB, budget: BUDGET.totalCss },
]

let failed = false
console.log('\nBudgets (gzip) :')
for (const { name, value, budget } of checks) {
  const ok = value <= budget
  if (!ok) failed = true
  console.log(`  ${ok ? '✓' : '✗'} ${name} : ${value.toFixed(1)} / ${budget} Ko`)
}

if (failed) {
  console.error(
    '\n✗ Budget de bundle dépassé — réduire le poids ou ajuster le budget en connaissance de cause.',
  )
  process.exit(1)
}
console.log('\n✓ Budgets respectés.')
