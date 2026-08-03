// Garde-fou de sécurité : vérifie que le `_headers` servi par Cloudflare Pages contient bien les
// en-têtes de sécurité requis et que la CSP garde ses directives critiques.
// But : empêcher une régression silencieuse (suppression/affaiblissement d'un en-tête lors d'un
// futur changement). Exécuté en CI après le build.
//
//   node scripts/check-headers.mjs            → plateforme (dist/)          — `npm run headers`
//   node scripts/check-headers.mjs builder    → CTD Builder (dist-builder/) — `npm run headers:builder`
//
// Les deux cibles ne se contrôlent PAS de la même façon, et c'est le cœur du sujet : le CTD
// Builder autonome se vend sur l'absence de sortie réseau (PLAN-CTD-BUILDER §1). Pour lui,
// `connect-src` n'est pas « présent », il vaut `'self'` et rien d'autre — vérifié comme tel.
//
// ⚠️ Trois pièges, tous constatés en revue, tous corrigés ici — ne pas les réintroduire :
//  1. Les règles Cloudflare se CUMULENT. Une seconde section `/*` ajoutée en fin de fichier
//     élargissait la CSP sans que rien ne bronche → on exige une seule section `/*` et on ne
//     lit les en-têtes de sécurité QUE dans celle-là (jamais par `includes` sur tout le fichier :
//     un en-tête posé dans une section sans portée aurait suffi à faire passer le contrôle).
//  2. Une ligne `Content-Security-Policy-Report-Only` posée AVANT la vraie était lue à sa place
//     → on distingue les deux, et on exige exactement une CSP appliquée.
//  3. Un nom de directive n'est pas un préfixe : `style-src` ne doit pas lire `style-src-attr`.
//     On découpe la politique en directives une fois pour toutes.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const TARGETS = {
  app: {
    label: 'plateforme (dist/_headers)',
    dist: '../dist',
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
    label: 'CTD Builder autonome (dist-builder/_headers)',
    dist: '../dist-builder',
    source: 'web/public-builder/_headers',
    // Aucune requête ne sort : rien à révéler à personne, même pas l'origine.
    referrerPolicy: 'Referrer-Policy: no-referrer',
    // Pas de règle `/sw.js` : le service worker arrive au lot B9, avec sa stratégie
    // d'activation atomique. La règle sera ajoutée avec lui.
    cacheRules: [
      { section: '/assets/*', header: 'Cache-Control: public, max-age=31536000, immutable' },
    ],
    // LE contrôle du produit : la seule origine joignable est elle-même.
    connectSrcExact: "'self'",
    // Aucun style inline dans cette cible (l'entrée HTML n'en a pas) → on garde le cran serré.
    strictStyleSrc: true,
    // Rien à observer sur cette origine : une CSP en mode rapport y serait un angle mort.
    allowReportOnly: false,
    // Le `_headers` est copié AVANT que les chunks soient écrits : sans cette exigence, le
    // contrôle passait au vert sur un `dist-builder/` ne contenant QUE `_headers` et
    // `_redirects` — c'est-à-dire sur un site totalement vide, prêt à être déployé.
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

const DIST = path.resolve(import.meta.dirname, target.dist)
const HEADERS_FILE = path.join(DIST, '_headers')

let content
try {
  content = readFileSync(HEADERS_FILE, 'utf8')
} catch {
  console.error(`✗ Fichier introuvable : ${HEADERS_FILE} — lance le build de cette cible d'abord.`)
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

let failed = false
const check = (ok, label) => {
  if (!ok) failed = true
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
}

const sections = parseSections(content)
const globalSections = sections.filter((s) => s.path === '/*')

console.log(`Cible : ${target.label}\n`)

console.log('Structure du fichier :')
check(
  globalSections.length === 1,
  `exactement une section /* (les règles Cloudflare se CUMULENT) — trouvé : ${globalSections.length}`,
)

const globalHeaders = globalSections.flatMap((s) => s.headers)
const has = (needle) => globalHeaders.some((h) => h.startsWith(needle) || h.includes(needle))

const REQUIRED_HEADERS = [
  'X-Frame-Options: DENY',
  'X-Content-Type-Options: nosniff',
  target.referrerPolicy,
  'Strict-Transport-Security: max-age=',
  'Permissions-Policy:',
  'Cross-Origin-Opener-Policy: same-origin',
]

console.log('\nEn-têtes de sécurité (section /* uniquement) :')
for (const h of REQUIRED_HEADERS) check(has(h), h)

const cspHeaders = globalHeaders.filter((h) => /^Content-Security-Policy(-Report-Only)?:/.test(h))
const enforced = cspHeaders.filter((h) => !/^Content-Security-Policy-Report-Only:/.test(h))
const reportOnly = cspHeaders.filter((h) => /^Content-Security-Policy-Report-Only:/.test(h))

console.log('\nCSP :')
check(enforced.length === 1, `exactement une CSP APPLIQUÉE — trouvé : ${enforced.length}`)
if (!target.allowReportOnly) {
  check(reportOnly.length === 0, 'aucune CSP en mode rapport (rien à observer sur cette origine)')
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

if (target.requiredArtifacts.length > 0) {
  console.log('\nArtefact réellement produit :')
  for (const file of target.requiredArtifacts) {
    check(existsSync(path.join(DIST, file)), `présent : ${file}`)
  }
  const assetsDir = path.join(DIST, 'assets')
  const jsEmitted = existsSync(assetsDir) && readdirSync(assetsDir).some((f) => f.endsWith('.js'))
  check(jsEmitted, 'au moins un chunk JS émis dans assets/')
}

if (failed) {
  console.error(`\n✗ En-têtes de sécurité incomplets — voir ${target.source}.`)
  process.exit(1)
}
console.log('\n✓ En-têtes de sécurité conformes.')
