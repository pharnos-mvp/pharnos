// Garde-fou de sécurité : vérifie que dist/_headers (servi par Cloudflare Pages) contient
// bien les headers de sécurité requis et que la CSP garde ses directives critiques.
// But : empêcher une régression silencieuse (suppression/affaiblissement d'un header lors
// d'un futur changement). Exécuté en CI après `npm run build`.
import { readFileSync } from 'node:fs'
import path from 'node:path'

const HEADERS_FILE = path.resolve(import.meta.dirname, '../dist/_headers')

let content
try {
  content = readFileSync(HEADERS_FILE, 'utf8')
} catch {
  console.error(`✗ Fichier introuvable : ${HEADERS_FILE} — lance \`npm run build\` d'abord.`)
  process.exit(1)
}

// La CSP peut être en mode Report-Only (phase d'observation) ou enforce — l'un des deux
// doit être présent, avec toutes les directives critiques.
const cspLine = content
  .split('\n')
  .find((l) => /^\s+Content-Security-Policy(-Report-Only)?:/.test(l))

const REQUIRED_HEADERS = [
  'X-Frame-Options: DENY',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Strict-Transport-Security: max-age=',
  'Permissions-Policy:',
  'Cross-Origin-Opener-Policy: same-origin',
]

const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'", // strict : pas d'unsafe-inline script
  'connect-src',
  'worker-src',
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
]

const REQUIRED_CACHE_RULES = [
  // Assets fingerprintés en cache long ; SW toujours revalidé (propagation des MAJ).
  { section: '/assets/*', header: 'Cache-Control: public, max-age=31536000, immutable' },
  { section: '/sw.js', header: 'Cache-Control: no-cache' },
]

let failed = false
const check = (ok, label) => {
  if (!ok) failed = true
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

console.log('Headers de sécurité :')
for (const h of REQUIRED_HEADERS) check(content.includes(h), h)

console.log('\nCSP :')
check(Boolean(cspLine), 'présence Content-Security-Policy(-Report-Only)')
if (cspLine) {
  for (const d of REQUIRED_CSP_DIRECTIVES) check(cspLine.includes(d), d)
  // script-src ne doit JAMAIS contenir unsafe-inline (le build n'a aucun script inline).
  const scriptSrc = cspLine.match(/script-src[^;]*/)?.[0] ?? ''
  check(!scriptSrc.includes('unsafe-inline'), "script-src sans 'unsafe-inline'")
}

console.log('\nRègles de cache :')
for (const { section, header } of REQUIRED_CACHE_RULES) {
  const sectionIdx = content.indexOf(`${section}\n`)
  const ok = sectionIdx !== -1 && content.slice(sectionIdx).includes(header)
  check(ok, `${section} → ${header}`)
}

if (failed) {
  console.error('\n✗ Headers de sécurité incomplets — voir web/public/_headers.')
  process.exit(1)
}
console.log('\n✓ Headers de sécurité conformes.')
