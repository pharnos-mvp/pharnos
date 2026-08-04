// Garde-fou de sécurité : vérifie que le `_headers` servi par Cloudflare Pages contient bien les
// en-têtes de sécurité requis et que la CSP garde ses directives critiques.
// But : empêcher une régression silencieuse (suppression/affaiblissement d'un en-tête lors d'un
// futur changement). Exécuté en CI après le build.
//
//   node scripts/check-headers.mjs            → plateforme app.pharnos.com (dist/)
//   node scripts/check-headers.mjs builder    → CTD Builder builder.pharnos.com (dist-builder/)
//
// Les deux cibles ne se contrôlent PAS de la même façon, et c'est le cœur du sujet : le CTD
// Builder se vend sur l'absence de sortie réseau (PLAN-CTD-BUILDER §1). Pour lui, `connect-src`
// n'est pas « présent », il vaut `'self'` et rien d'autre — vérifié comme tel.
//
// ⚠️ LES RÈGLES CLOUDFLARE SE CUMULENT, et tout ce fichier en découle. Une section plus précise
// AJOUTE ses en-têtes à ceux de `/*` ; pour en remplacer un, il faut le détacher (`! Nom`) puis
// le reposer. Le contrôle reproduit donc ce calcul — `effectiveHeaders()` — au lieu de chercher
// des chaînes dans le fichier : le builder hérite de `/*` la protection anti-cadrage et HSTS,
// mais impose SA CSP, qui serait sinon celle de la landing (laquelle autorise Supabase et le
// processeur de paiement).
//
// ⚠️ Trois autres pièges, tous constatés en revue, tous fermés ici :
//  1. une seconde section `/*` élargissait la politique sans que rien ne bronche ;
//  2. une ligne `Content-Security-Policy-Report-Only` posée AVANT la vraie était lue à sa place ;
//  3. un nom de directive n'est pas un préfixe : `style-src` ne doit pas lire `style-src-attr`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const TARGETS = {
  app: {
    label: 'plateforme app.pharnos.com (dist/_headers)',
    headersFile: '../dist/_headers',
    section: '/*',
    artifactDir: null,
    source: 'web/public/_headers',
    referrerPolicy: 'Referrer-Policy: strict-origin-when-cross-origin',
    cacheRules: [
      // Assets empreintés en cache long ; SW toujours revalidé (propagation des MAJ).
      { section: '/assets/*', header: 'Cache-Control: public, max-age=31536000, immutable' },
      { section: '/sw.js', header: 'Cache-Control: no-cache' },
    ],
    // La plateforme parle à Supabase et à Sentry : on vérifie la présence de la directive,
    // pas sa valeur. Elle utilise aussi le mode Report-Only lors des bascules de CSP.
    connectSrcExact: null,
    strictStyleSrc: false,
    allowReportOnly: true,
    requiredArtifacts: [],
  },
  builder: {
    label: 'CTD Builder (builder.pharnos.com — dist-builder/_headers)',
    headersFile: '../dist-builder/_headers',
    section: '/*',
    artifactDir: '../dist-builder',
    source: 'web/public-builder/_headers',
    // Aucune requête ne sort : rien à révéler à personne, même pas l'origine.
    referrerPolicy: 'Referrer-Policy: no-referrer',
    // Pas de règle `/sw.js` : le service worker arrive au lot B9, avec sa stratégie
    // d'activation atomique. La règle sera ajoutée avec lui.
    // Même règle que la plateforme : assets empreintés, cache long. Le risque du repli SPA qui
    // sert du HTML sous une URL d'asset est documenté dans `public-builder/_headers`.
    cacheRules: [
      { section: '/assets/*', header: 'Cache-Control: public, max-age=31536000, immutable' },
    ],
    // LE contrôle du produit : la seule origine joignable est elle-même.
    connectSrcExact: "'self'",
    // Aucun style inline dans cette cible (l'entrée HTML n'en a pas) → on garde le cran serré.
    strictStyleSrc: true,
    // Rien à observer sur ce chemin : une CSP en mode rapport y serait un angle mort.
    allowReportOnly: false,
    // Sans cette exigence, le contrôle passait au vert sur un `/ctd-builder/` inexistant ou vidé
    // par un build échoué — c'est-à-dire sur une entrée de header menant à un 404.
    requiredArtifacts: ['index.html'],
  },
}

const targetName = process.argv[2] ?? 'app'
const target = TARGETS[targetName]
if (!target) {
  console.error(
    `✗ Cible inconnue : « ${targetName} » — attendu : ${Object.keys(TARGETS).join(' | ')}`,
  )
  process.exit(1)
}

const HEADERS_FILE = path.resolve(import.meta.dirname, target.headersFile)

let content
try {
  content = readFileSync(HEADERS_FILE, 'utf8')
} catch {
  console.error(`✗ Fichier introuvable : ${HEADERS_FILE}`)
  process.exit(1)
}

/**
 * Découpe un `_headers` Cloudflare en sections : une ligne non indentée commençant par `/` ouvre
 * une section, les lignes indentées qui suivent sont ses en-têtes. Commentaires et lignes vides
 * ignorés.
 */
function parseSections(text) {
  const sections = []
  let current = null
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) {
      current = { path: raw.trim(), headers: [] }
      sections.push(current)
    } else if (current) {
      current.headers.push(raw.trim())
    }
  }
  return sections
}

/** Nom d'un en-tête (`Content-Security-Policy: …` → `content-security-policy`). */
const headerName = (line) => (line.split(':')[0] ?? '').trim().toLowerCase()

/**
 * En-têtes RÉELLEMENT servis sur un chemin : ceux de `/*`, moins ceux que la section détache
 * (`! Nom`), plus ceux qu'elle pose. C'est la règle de cumul de Cloudflare Pages, reproduite —
 * la chercher par sous-chaîne dans le fichier donnerait une réponse fausse dans les deux sens.
 */
function effectiveHeaders(sections, sectionPath) {
  let headers = sections.filter((s) => s.path === '/*').flatMap((s) => s.headers)
  if (sectionPath === '/*') return headers
  for (const s of sections.filter((s) => s.path === sectionPath)) {
    for (const line of s.headers) {
      if (line.startsWith('!')) {
        const detached = line.slice(1).trim().toLowerCase()
        headers = headers.filter((h) => headerName(h) !== detached)
      }
    }
    headers = headers.concat(s.headers.filter((l) => !l.startsWith('!')))
  }
  return headers
}

let failed = false
const check = (ok, label) => {
  if (!ok) failed = true
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

const sections = parseSections(content)
const globalSections = sections.filter((s) => s.path === '/*')
const targetSections = sections.filter((s) => s.path === target.section)

console.log(`Cible : ${target.label}\n`)

console.log('Structure du fichier :')
check(
  globalSections.length === 1,
  `exactement une section /* (les règles Cloudflare se CUMULENT) — trouvé : ${globalSections.length}`,
)
if (target.section !== '/*') {
  check(targetSections.length === 1, `exactement une section ${target.section}`)
}

const applied = effectiveHeaders(sections, target.section)
const has = (needle) => applied.some((h) => h.startsWith(needle) || h.includes(needle))

const REQUIRED_HEADERS = [
  'X-Frame-Options: DENY',
  'X-Content-Type-Options: nosniff',
  target.referrerPolicy,
  'Strict-Transport-Security: max-age=',
  'Permissions-Policy:',
  'Cross-Origin-Opener-Policy: same-origin',
]

console.log(`\nEn-têtes réellement servis sur ${target.section} :`)
for (const h of REQUIRED_HEADERS) check(has(h), h)
// Un en-tête posé DEUX fois (cumul non détaché) laisse le navigateur arbitrer : on l'interdit.
for (const name of ['content-security-policy', 'referrer-policy']) {
  const n = applied.filter((h) => headerName(h) === name).length
  check(n <= 1, `${name} servi une seule fois (cumul détaché) — trouvé : ${n}`)
}

const cspHeaders = applied.filter((h) => /^Content-Security-Policy(-Report-Only)?:/.test(h))
const enforced = cspHeaders.filter((h) => !/^Content-Security-Policy-Report-Only:/.test(h))
const reportOnly = cspHeaders.filter((h) => /^Content-Security-Policy-Report-Only:/.test(h))

console.log('\nCSP :')
check(enforced.length === 1, `exactement une CSP APPLIQUÉE — trouvé : ${enforced.length}`)
if (!target.allowReportOnly) {
  check(reportOnly.length === 0, 'aucune CSP en mode rapport (rien à observer sur ce chemin)')
}

if (enforced.length === 1) {
  const policy = enforced[0].replace(/^Content-Security-Policy:\s*/, '')
  /** name → valeur, découpé une seule fois : un nom de directive n'est pas un préfixe. */
  const directives = new Map(
    policy
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...rest] = d.split(/\s+/)
        return [name, rest.join(' ')]
      }),
  )
  const value = (name) => directives.get(name) ?? null

  const REQUIRED_CSP_DIRECTIVES = [
    ['default-src', "'self'"],
    ['script-src', null], // valeur libre, mais strict : pas d'unsafe-inline (contrôlé plus bas)
    ['connect-src', null],
    ['worker-src', null],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['frame-ancestors', "'none'"],
  ]
  for (const [name, expected] of REQUIRED_CSP_DIRECTIVES) {
    const got = value(name)
    if (expected === null) check(got !== null, `${name} présente`)
    else check(got === expected, `${name} ${expected}`)
  }

  // script-src ne doit JAMAIS contenir unsafe-inline (le build n'a aucun script inline).
  check(!(value('script-src') ?? '').includes("'unsafe-inline'"), "script-src sans 'unsafe-inline'")
  if (target.strictStyleSrc) {
    check(!(value('style-src') ?? '').includes("'unsafe-inline'"), "style-src sans 'unsafe-inline'")
    // `style-src-attr` / `style-src-elem` l'emportent sur `style-src` : les contrôler aussi,
    // sinon le cran serré se contourne en une ligne.
    for (const n of ['style-src-attr', 'style-src-elem']) {
      check(!(value(n) ?? '').includes("'unsafe-inline'"), `${n} sans 'unsafe-inline'`)
    }
  }
  if (target.connectSrcExact) {
    // Égalité STRICTE, pas `includes` : `connect-src 'self' https://exfil.example` contiendrait
    // `connect-src 'self'` et passerait un contrôle par sous-chaîne. C'est précisément la
    // régression que ce garde-fou existe pour attraper.
    const got = value('connect-src')
    check(
      got === target.connectSrcExact,
      `connect-src EXACTEMENT « ${target.connectSrcExact} » (aucune origine tierce) — lu : « ${got} »`,
    )
  }
}

console.log('\nRègles de cache :')
for (const { section, header } of target.cacheRules) {
  const found = sections.find((s) => s.path === section)
  check(Boolean(found?.headers.includes(header)), `${section} → ${header}`)
}

if (target.artifactDir && target.requiredArtifacts.length > 0) {
  const dir = path.resolve(import.meta.dirname, target.artifactDir)
  console.log('\nArtefact réellement assemblé :')
  for (const file of target.requiredArtifacts) {
    check(existsSync(path.join(dir, file)), `présent : ${path.join(target.artifactDir, file)}`)
  }
  const assetsDir = path.join(dir, 'assets')
  const jsEmitted = existsSync(assetsDir) && readdirSync(assetsDir).some((f) => f.endsWith('.js'))
  check(jsEmitted, 'au moins un chunk JS émis dans assets/')
}

if (failed) {
  console.error(`\n✗ En-têtes de sécurité incomplets — voir ${target.source}.`)
  process.exit(1)
}
console.log('\n✓ En-têtes de sécurité conformes.')
