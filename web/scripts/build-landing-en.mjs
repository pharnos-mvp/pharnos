// Génère les pages ANGLAISES prérendues (SEO) de landing/ à partir de leurs sources FR —
// SOURCE UNIQUE. Le landing est FR-inline + attributs `data-en` ; chaque page miroir est
// EN-inline + `data-fr` (pour le retour), `<html lang=en>`, head EN, hreflang.
// Un crawler voit donc l'anglais SANS JS. Idempotent → la CI régénère et compare (garde anti-dérive).
//
//   Régénérer : `npm run build:landing-en` (depuis web/). À lancer après TOUTE modif d'une source.
//
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'

const LANDING = path.resolve(import.meta.dirname, '../../landing')

// ── Une entrée par page miroir. `head` = traductions du <head> (le corps vient des `data-en`). ──
const PAGES = [
  {
    src: 'index.html',
    out: path.join('en', 'index.html'),
    canonical: 'https://pharnos.com/en/',
    head: {
      title: 'Pharnos — The pharmaceutical regulatory platform for Africa',
      description:
        'CTD Builder, submission, seamless collaboration between manufacturer and local representative, real-time tracking — on a single dashboard. UEMOA / CEDEAO.',
      ogDescription:
        'CTD Builder, submission, collaboration, real-time tracking — on a single dashboard. UEMOA / CEDEAO.',
      ogImage: 'https://pharnos.com/assets/og-image-en.png?v=1',
      ogImageAlt: 'Pharnos — the pharmaceutical regulatory platform for Africa (UEMOA / CEDEAO).',
    },
    jsonLd: {
      orgDescription:
        'The pharmaceutical regulatory platform for Africa — CTD Builder, submission, collaboration and real-time tracking. UEMOA / CEDEAO.',
      appDescription:
        'The operating system for pharmaceutical regulatory affairs: RIM catalogue, CTD Builder in the UEMOA framework, correspondence and dossier lifecycle, Regafy AI.',
      offerDescription: 'Free Pilot plan; paid plans from 100,000 FCFA / month.',
    },
  },
  {
    src: 'checking-standard.html',
    out: path.join('en', 'checking-standard.html'),
    canonical: 'https://pharnos.com/en/checking-standard',
    head: {
      title: 'Checking Standard — is your MA dossier ready for reception? · Pharnos',
      description:
        'Preparing a marketing authorisation filing in the WAEMU zone? Measure your dossier’s completeness against the reception standard in 3 minutes, without sharing a single document. Score, preparation plan, official templates.',
      ogDescription:
        'A free completeness diagnostic, no sign-up and no document upload. Regulation 04/2020/WAEMU, 8 countries, official templates.',
      ogImage: 'https://pharnos.com/assets/og-image-en.png?v=1',
      ogImageAlt:
        'Pharnos — the Checking Standard, MA dossier completeness diagnostic for the WAEMU zone.',
    },
  },
]

const BANNER = (src) =>
  `<!-- FICHIER GENERE par web/scripts/build-landing-en.mjs a partir de ../${src} (version EN\n` +
  '     prerendue pour le SEO). NE PAS EDITER A LA MAIN — lancer `npm run build:landing-en` apres\n' +
  `     toute modif de ${src}. La CI verifie que cette page reste synchronisee. -->`

for (const page of PAGES) buildPage(page)

function buildPage({ src, out, canonical, head: EN, jsonLd }) {
  const SRC = path.join(LANDING, src)
  const OUT = path.join(LANDING, out)
  const dom = new JSDOM(fs.readFileSync(SRC, 'utf8'))
  const D = dom.window.document
  const NODE_TEXT = dom.window.Node.TEXT_NODE

  // 1. Corps : bascule `data-en` → `data-fr`, texte inline → EN (préserve les enfants : icônes SVG).
  for (const el of D.querySelectorAll('[data-en]')) {
    let fr = ''
    for (const n of el.childNodes) {
      if (n.nodeType === NODE_TEXT && n.nodeValue.trim()) {
        fr = n.nodeValue
        break
      }
    }
    const en = el.getAttribute('data-en')
    let done = false
    for (const n of el.childNodes) {
      if (n.nodeType === NODE_TEXT && n.nodeValue.trim()) {
        if (!done) {
          n.nodeValue = en
          done = true
        } else {
          n.nodeValue = ''
        }
      }
    }
    if (!done) el.appendChild(D.createTextNode(en))
    el.setAttribute('data-fr', fr)
    el.removeAttribute('data-en')
  }

  // 2. Attributs traduisibles : `data-en-<k>` → `data-fr-<k>` (aria-label / placeholder / title / label).
  for (const [k, attr] of [
    ['al', 'aria-label'],
    ['ph', 'placeholder'],
    ['ti', 'title'],
    ['lb', 'label'],
  ]) {
    for (const el of D.querySelectorAll(`[data-en-${k}]`)) {
      const frv = el.getAttribute(attr) || ''
      el.setAttribute(attr, el.getAttribute(`data-en-${k}`))
      el.setAttribute(`data-fr-${k}`, frv)
      el.removeAttribute(`data-en-${k}`)
    }
  }

  // 3. Langue du document.
  D.documentElement.setAttribute('lang', 'en')

  // 3b. Liens internes → leur miroir EN. Sans ça, un visiteur anglophone qui clique « Checking
  // Standard » depuis /en/ atterrit sur la page FR (et un crawler indexe un lien inter-langues).
  // Seuls les chemins qui ONT un miroir sont réécrits ; le reste est laissé intact.
  const MIRRORED = new Set(['/', ...PAGES.map((p) => '/' + p.src.replace(/\.html$/, ''))])
  for (const a of D.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    if (!href.startsWith('/') || href.startsWith('/en/')) continue
    const hashAt = href.indexOf('#')
    const p = hashAt === -1 ? href : href.slice(0, hashAt)
    const hash = hashAt === -1 ? '' : href.slice(hashAt)
    const pathname = p || '/'
    if (!MIRRORED.has(pathname)) continue
    a.setAttribute('href', (pathname === '/' ? '/en/' : '/en' + pathname) + hash)
  }

  // 4. <head> anglais (les hreflang, réciproques, sont hérités inchangés de index.html).
  const setA = (sel, attr, val) => {
    const e = D.querySelector(sel)
    if (e) e.setAttribute(attr, val)
  }
  setA('meta[name="description"]', 'content', EN.description)
  setA('meta[property="og:title"]', 'content', EN.title)
  setA('meta[property="og:description"]', 'content', EN.ogDescription)
  setA('meta[name="twitter:title"]', 'content', EN.title)
  setA('meta[name="twitter:description"]', 'content', EN.ogDescription)
  setA('meta[property="og:url"]', 'content', canonical)
  setA('link[rel="canonical"]', 'href', canonical)
  setA('meta[property="og:locale"]', 'content', 'en_US')
  setA('meta[property="og:locale:alternate"]', 'content', 'fr_FR')
  setA('meta[property="og:image"]', 'content', EN.ogImage)
  setA('meta[name="twitter:image"]', 'content', EN.ogImage)
  setA('meta[property="og:image:alt"]', 'content', EN.ogImageAlt)

  // 5. Données structurées JSON-LD : descriptions en anglais (sinon FR sur l'URL EN).
  const ld = D.querySelector('script[type="application/ld+json"]')
  if (ld && jsonLd) {
    const data = JSON.parse(ld.textContent)
    for (const node of data['@graph'] || []) {
      if (node['@type'] === 'Organization') node.description = jsonLd.orgDescription
      if (node['@type'] === 'SoftwareApplication') {
        node.description = jsonLd.appDescription
        if (node.offers) node.offers.description = jsonLd.offerDescription
      }
    }
    ld.textContent = '\n' + JSON.stringify(data, null, 2) + '\n'
  }

  // 6. Pastille de langue : EN active (pré-peinture / sans-JS corrects sur la page EN).
  for (const grp of D.querySelectorAll('.lang')) {
    for (const b of grp.querySelectorAll('button')) {
      const isEn = b.textContent.trim().toLowerCase() === 'en'
      b.classList.toggle('on', isEn)
      b.setAttribute('aria-pressed', String(isEn))
    }
  }

  const html = '<!doctype html>\n' + BANNER(src) + '\n' + D.documentElement.outerHTML + '\n'
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, html, 'utf8')
  process.stdout.write(
    `build-landing-en: wrote ${path.relative(process.cwd(), OUT)} (${html.length} bytes)\n`,
  )
}
