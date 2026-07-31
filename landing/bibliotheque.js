/* ── Bibliothèque réglementaire — contrôleur de /bibliotheque-reglementaire.
     Module ES natif : la landing n'a pas d'étape de build, le navigateur charge ce fichier tel
     quel. CSP `script-src 'self'` et `style-src 'self'` :
       • aucun script inline,
       • aucun attribut `style="…"` produit par innerHTML — ce qui varie passe par une CLASSE.
     Tout texte interpolé passe par `esc()`.

     ⚠️ INVARIANT CENTRAL DE CE FICHIER — LE FICHIER DU CLIENT NE QUITTE PAS LE NAVIGATEUR AVANT
     LE PAIEMENT. Il est choisi, affiché comme déposé, conservé dans IndexedDB sous la référence
     de commande, et rien d'autre. Aucun `fetch`, aucun `FormData`, aucune requête ne le porte
     ici. Le premier envoi a lieu au RETOUR du paiement, et il appartient au traitement, pas à
     cette page. La recette le vérifie dans l'onglet Réseau : aucune requête portant le document
     avant le règlement. ── */

/* ⚠️ Le `?v=` des imports N'EST PAS décoratif — c'est le SEUL levier de fraîcheur : Cloudflare
   impose `max-age=14400` aux assets de la landing, et un module importé PAR un module n'hérite
   pas du `?v=` posé dans le HTML. `landing/checking/*` est en `no-cache` côté `_headers`, ce qui
   couvre ces trois-là ; le `?v=` reste la ceinture. À bumper avec le HTML. */
import { PAYS } from './checking/referentiel.js?v=2026.2'
import { MODELES_FICHIERS, MODELES_VERSION } from './checking/modeles-manifest.js?v=2026.1'
import { VIGILANCE } from './checking/vigilance.js?v=2026.1'
import {
  estPerimee,
  fichierModele,
  MAX_OCTETS,
  nouvelleCommande,
  OFFRES,
  PRIX,
  PRIX_UP3_PLEIN,
  prixCourt,
  prixDouble,
  tailleLisible,
  validerFichier,
  varieParPays,
} from './checking/bibliotheque-core.js?v=2026.1'

const $ = (s) => document.querySelector(s)
const $$ = (s) => Array.from(document.querySelectorAll(s))
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ══ i18n ══ */
let lang = window.I18N && typeof window.I18N.get === 'function' ? window.I18N.get() : 'fr'
const L = (v) => (Array.isArray(v) ? (v[lang === 'en' ? 1 : 0] ?? v[0]) : v)

/**
 * Liens de règlement Chariow, isolés sur `services.pharnos.com` — la CSP de pharnos.com
 * (`script-src 'self'`) interdit le script Snap ici, d'où un domaine séparé.
 *
 * ⚠️ Tant qu'une offre n'a pas son lien, le bouton NE PROMET PAS un paiement : il propose d'être
 * rappelé. Un bouton « Commander » qui mène à une page vide coûte plus qu'un bouton absent.
 * Renseigner ces deux valeurs suffit à ouvrir la vente.
 */
const CHECKOUT = { up1: '', up3: '' }
const checkoutOuvert = (offre) => Boolean(CHECKOUT[offre])

/* ══ État ══ */
const S = { pays: 'bj', doc: 'rcp', activite: 'amm', fichier: null }

const DOCS = Object.keys(MODELES_FICHIERS)
const paysObj = (k) => PAYS.find((p) => p.k === k) ?? PAYS[0]
const nomPays = (k) => L(paysObj(k).nom)

/** Le français accorde le possessif : « mon RCP » mais « ma notice ». Composer un libellé par
 *  concaténation (« Mettre mon » + court) donnerait « Mettre mon Notice ». Les deux formes sont
 *  donc écrites en toutes lettres, par document. */
const POSSESSIF = {
  rcp: ['Votre RCP, lui, ne l’est pas.', 'Your SmPC is not.'],
  notice: ['Votre notice, elle, ne l’est pas.', 'Your leaflet is not.'],
  etiquetage: ['Votre étiquetage, lui, ne l’est pas.', 'Your labelling is not.'],
}
const MON = {
  rcp: ['mon RCP', 'my SmPC'],
  notice: ['ma notice', 'my leaflet'],
  etiquetage: ['mon étiquetage', 'my labelling'],
}
const monDoc = (slug) => L(MON[slug] ?? MON.rcp)

/* ══════════════════ Contexte pays ══════════════════ */

function remplirPays(sel, valeur) {
  sel.innerHTML = PAYS.map((p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`).join('')
  sel.value = valeur
}

function peindreContexte() {
  const v = VIGILANCE[S.pays]
  $('#agline').innerHTML =
    `${esc(L(['Autorité : ', 'Authority: ']))}<b>${esc(v.organisme)}</b>`

  // ⚠️ Cinq pays sur huit n'ont AUCUN contact publié. Le repli neutre est le cas COURANT : la
  // phrase ne doit jamais le présenter comme une lacune du pays ou de notre couverture.
  $('#paysnote').innerHTML = v.contact
    ? esc(
        L([
          'Le RCP que vous téléchargez porte déjà la mention de pharmacovigilance exigée en rubrique 4.8, avec le contact publié par ',
          'The SmPC you download already carries the pharmacovigilance statement required in section 4.8, with the contact published by ',
        ]),
      ) + `<b>${esc(v.organisme)}</b>.`
    : esc(
        L([
          'Le RCP que vous téléchargez porte déjà la mention de pharmacovigilance exigée en rubrique 4.8, dans sa formule nationale — ',
          'The SmPC you download already carries the pharmacovigilance statement required in section 4.8, in its national wording — ',
        ]),
      ) +
      `<b>${esc(v.organisme)}</b>` +
      esc(
        L([
          ' ne publie pas d’adresse de déclaration.',
          ' does not publish a reporting address.',
        ]),
      )
}

/* ══════════════════ Cartes ══════════════════ */

function peindreCartes() {
  $('#grid').innerHTML = DOCS.map((slug) => {
    const m = MODELES_FICHIERS[slug]
    const f = fichierModele(slug, S.pays)
    const meta = `${f.pages} ${esc(L(['pages', 'pages']))} · PDF + Word · ${esc(tailleLisible(f.octetsPdf + f.octetsDocx, lang))}`
    const drapeau = m.perPays
      ? `<span class="badge b-pays">${esc(L(['Selon le pays', 'Country-specific']))}</span>`
      : ''
    const up = m.upgradable
      ? `<span class="badge b-info">${esc(L(['Mise à niveau', 'Upgrade']))}</span>`
      : ''
    return `<button type="button" class="tplcard" data-doc="${esc(slug)}">
      <span class="ct"><span class="gl" aria-hidden="true">▤</span><b>${esc(L(m.court))}</b>${drapeau}</span>
      <span class="cs2">${esc(L(m.resume))}</span>
      <span class="cm">${meta}</span>
      <span class="cf"><span class="see">${esc(L(['Ouvrir et télécharger', 'Open and download']))} →</span>${up}</span>
    </button>`
  }).join('')
  $$('#grid .tplcard').forEach((b) => b.addEventListener('click', () => ouvrirLecteur(b.dataset.doc, b)))
}

/* ══════════════════ Lecteur ══════════════════ */

function ouvrirLecteur(slug, declencheur) {
  const m = MODELES_FICHIERS[slug]
  if (!m) return
  S.doc = slug
  const f = fichierModele(slug, S.pays)
  const v = VIGILANCE[S.pays]

  $('#lectkick').textContent = m.perPays
    ? `${L(['Modèle officiel', 'Official template'])} · ${nomPays(S.pays)}`
    : L(['Modèle officiel', 'Official template'])
  $('#lecttitle').textContent = L(m.nom)
  $('#lectsub').textContent = [
    `${f.pages} ${L(['pages', 'pages'])}`,
    L(m.source),
    m.perPays
      ? `${L(['mention de pharmacovigilance', 'pharmacovigilance statement'])} ${nomPays(S.pays)}`
      : L(['identique dans les huit pays', 'identical across the eight countries']),
  ].join(' · ')

  const vig = $('#lectvig')
  vig.hidden = !m.perPays
  if (m.perPays) vig.textContent = `4.8 · ${v.organisme}`

  // Le fichier est servi tel quel : c'est CE fichier que le visiteur télécharge, pas une
  // ossature reconstruite pour l'écran.
  const apercu = $('#docview')
  const repli = $('#docfall')
  const supporte = navigator.pdfViewerEnabled !== false
  apercu.hidden = !supporte
  repli.hidden = supporte
  if (supporte) apercu.src = `${f.pdf}?v=${encodeURIComponent(MODELES_VERSION)}`
  else {
    apercu.removeAttribute('src')
    repli.textContent = L([
      'Votre navigateur n’affiche pas les PDF dans la page. Le modèle reste téléchargeable ci-dessus, en PDF et en Word.',
      'Your browser does not display PDFs inline. The template is still downloadable above, as PDF and Word.',
    ])
  }

  const base = `${slug}${m.perPays ? `-${S.pays}` : ''}`
  $('#dlpdf').href = f.pdf
  $('#dlpdf').setAttribute('download', `${base}.pdf`)
  $('#dldocx').href = f.docx
  $('#dldocx').setAttribute('download', `${base}.docx`)

  $('#offerh').textContent = `${L(['Ce modèle est vide.', 'This template is empty.'])} ${L(POSSESSIF[slug] ?? POSSESSIF.rcp)}`
  peindreOffre()
  ouvrirModale('#lect', declencheur)
}

function peindreOffre() {
  const m = MODELES_FICHIERS[S.doc]
  $('#p1').textContent = prixDouble(PRIX.up1, lang)
  $('#goup').textContent = L([
    `Mettre ${monDoc(S.doc)} au standard`,
    `Bring ${monDoc(S.doc)} up to standard`,
  ])
  $('#goup').hidden = !m.upgradable
  $('#bundleline').innerHTML =
    `<b>${esc(L(['+ notice et étiquetage : ', '+ leaflet and labelling: ']))}${esc(prixDouble(PRIX.up3, lang))}</b> ` +
    `<span class="old">${esc(prixCourt(PRIX_UP3_PLEIN, lang))}</span>`
  $('#goup3').hidden = !m.upgradable
  $('.bundle-row').hidden = !m.upgradable
}

/* ══════════════════ Mise à niveau ══════════════════ */

/** L'ORDRE EST LA SPÉCIFICATION : pays → activité → dépôt → prix → bundle.
 *  ⚠️ Ne jamais ouvrir sur un prix. Le pays et l'activité entrent dans le prompt de CHAQUE
 *  rubrique : ils doivent être connus avant le premier appel, donc avant la commande. */
function ouvrirUpgrade(offre, declencheur) {
  $('#upgtitle').textContent = L([
    `Mettre ${monDoc(S.doc)} au standard officiel`,
    `Bring ${monDoc(S.doc)} up to the official standard`,
  ])
  $('#upgdesc').textContent = L([
    'Regafy AI le reconstruit rubrique par rubrique, sur le modèle du pays choisi.',
    'Regafy AI rebuilds it section by section, on the template of the selected country.',
  ])
  remplirPays($('#upays'), S.pays)
  peindreAchat()
  ouvrirModale('#upg', declencheur)
}

function peindreAchat() {
  $('#up1').textContent = prixDouble(PRIX.up1, lang)
  $('#bundlet').innerHTML =
    `${esc(L(['Les trois documents — ', 'All three documents — ']))}${esc(prixDouble(PRIX.up3, lang))}` +
    `<span class="old">${esc(prixCourt(PRIX_UP3_PLEIN, lang))}</span>` +
    `<span class="save">−${esc(prixCourt({ eur: PRIX_UP3_PLEIN.eur - PRIX.up3.eur }, lang))}</span>`

  const pret = S.fichier !== null
  for (const [sel, offre, libelle] of [
    ['#buy1', 'up1', ['Commander la mise à niveau', 'Order the upgrade']],
    ['#buy3', 'up3', ['Prendre les trois', 'Take all three']],
  ]) {
    const b = $(sel)
    b.textContent = checkoutOuvert(offre)
      ? `${L(libelle)} — ${prixCourt(OFFRES[offre].prix, lang)}`
      : `${L(['Être rappelé — ', 'Request a call back — '])}${prixCourt(OFFRES[offre].prix, lang)}`
    b.disabled = !pret
  }
}

function poserFichier(file) {
  const v = validerFichier(file)
  if (!v.ok) {
    toast(
      L(
        {
          absent: ['Choisissez un document.', 'Choose a document.'],
          extension: ['Formats acceptés : PDF, Word (.doc, .docx).', 'Accepted formats: PDF, Word (.doc, .docx).'],
          vide: ['Ce fichier est vide.', 'This file is empty.'],
          trop_gros: [
            `Ce document dépasse ${tailleLisible(MAX_OCTETS, lang)}. Envoyez-nous-le à contact@pharnos.com.`,
            `This document exceeds ${tailleLisible(MAX_OCTETS, lang)}. Send it to contact@pharnos.com.`,
          ],
        }[v.raison],
      ),
    )
    return
  }
  S.fichier = file
  $('#ufilename').textContent = file.name
  $('#ufilesize').textContent = tailleLisible(file.size, lang)
  $('#ufilerow').hidden = false
  $('#ureadyline').hidden = false
  $('#udrop').hidden = true
  peindreAchat()
}

function retirerFichier() {
  S.fichier = null
  $('#ufile').value = ''
  $('#ufilerow').hidden = true
  $('#ureadyline').hidden = true
  $('#udrop').hidden = false
  peindreAchat()
  $('#udrop').focus()
}

/* ══════════════════ Commande — le document survit au passage par le paiement ══════════════════ */

const DB_NOM = 'pharnos-bibliotheque'
const DB_STORE = 'commandes'

function ouvrirDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NOM, 1)
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(DB_STORE)) r.result.createObjectStore(DB_STORE, { keyPath: 'id' })
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

function transiger(db, mode, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, mode)
    const out = fn(tx.objectStore(DB_STORE))
    tx.oncomplete = () => res(out && 'result' in out ? out.result : undefined)
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
  })
}

const sauverCommande = async (cmd) => {
  const db = await ouvrirDb()
  await transiger(db, 'readwrite', (s) => s.put(cmd))
  db.close()
}

const lireCommande = async (id) => {
  const db = await ouvrirDb()
  const c = await transiger(db, 'readonly', (s) => s.get(id))
  db.close()
  return c
}

/** Purge les commandes au-delà de la durée de conservation. Un document de client ne reste pas
 *  indéfiniment dans le navigateur d'un poste partagé. */
async function purger() {
  const db = await ouvrirDb()
  const maintenant = Date.now()
  await transiger(db, 'readwrite', (s) => {
    const c = s.openCursor()
    c.onsuccess = () => {
      const cur = c.result
      if (!cur) return
      // `estPerimee` et non un calcul local : la règle de conservation est testée là-bas, et
      // deux expressions de la même durée finissent toujours par diverger.
      if (estPerimee(cur.value, maintenant)) cur.delete()
      cur.continue()
    }
  })
  db.close()
}

let enCours = false
async function acheter(offre) {
  if (enCours) return
  const v = validerFichier(S.fichier)
  if (!v.ok) {
    toast(L(['Déposez d’abord votre document.', 'Upload your document first.']))
    $('#udrop').focus()
    return
  }
  enCours = true
  const bouton = offre === 'up3' ? $('#buy3') : $('#buy1')
  const libelle = bouton.textContent
  bouton.disabled = true
  try {
    const cmd = nouvelleCommande({
      doc: S.doc,
      pays: S.pays,
      activite: S.activite,
      offre,
      fichier: S.fichier,
      nomFichier: S.fichier.name,
      octets: S.fichier.size,
      id: crypto.randomUUID(),
      cree: Date.now(),
    })
    // Conservé AVANT la navigation : le fichier doit survivre au passage par
    // services.pharnos.com. Sans cela, le client paie et se retrouve sans document — le pire
    // échec possible de ce parcours.
    await sauverCommande(cmd)

    if (checkoutOuvert(offre)) {
      const u = new URL(CHECKOUT[offre])
      // Référence opaque, jamais de donnée personnelle en clair dans une URL.
      u.searchParams.set('ref', cmd.id)
      window.location.assign(u.toString())
      return
    }
    ouvrirRappel(cmd)
  } catch (e) {
    // Échouer fort ici : si la commande n'a pas pu être conservée, la promettre serait mentir.
    console.error('commande', e)
    toast(L(['Impossible d’enregistrer la commande sur cet appareil.', 'Could not record the order on this device.']))
  } finally {
    enCours = false
    bouton.disabled = false
    bouton.textContent = libelle
  }
}

/** Sans lien de règlement configuré, on n'invente pas un paiement : on ouvre un e-mail portant
 *  le contexte de la commande. Le document, lui, reste sur l'appareil — il n'est pas joint. */
function ouvrirRappel(cmd) {
  const m = MODELES_FICHIERS[cmd.doc]
  const sujet = L([
    `Mise à niveau ${L(m.court)} — ${nomPays(cmd.pays)}`,
    `Upgrade ${L(m.court)} — ${nomPays(cmd.pays)}`,
  ])
  const corps = L([
    `Document : ${L(m.nom)}\nPays de dépôt : ${nomPays(cmd.pays)}\nActivité : ${libelleActivite(cmd.activite)}\nOffre : ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nRéférence : ${cmd.id}`,
    `Document: ${L(m.nom)}\nCountry of filing: ${nomPays(cmd.pays)}\nActivity: ${libelleActivite(cmd.activite)}\nOffer: ${prixDouble(OFFRES[cmd.offre].prix, lang)}\nReference: ${cmd.id}`,
  ])
  window.location.href = `mailto:contact@pharnos.com?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`
  toast(L([
    'Votre document reste sur cet appareil — nous ne l’avons pas reçu.',
    'Your document stays on this device — we have not received it.',
  ]))
}

const libelleActivite = (a) =>
  L(a === 'renouv' ? ['Renouvellement', 'Renewal'] : ['Nouvelle AMM', 'New MA'])

/** Retour de paiement : on retrouve le document conservé et on le remet sous les yeux du client.
 *  L'envoi au traitement appartient au worker (§B du plan), pas à cette page. */
async function reprendre() {
  const ref = new URLSearchParams(window.location.search).get('commande')
  if (!ref) return
  let cmd = null
  try {
    cmd = await lireCommande(ref)
  } catch (e) {
    console.error('reprise', e)
  }
  if (!cmd) {
    toast(L([
      'Cette commande n’a pas été retrouvée sur cet appareil. Écrivez-nous à contact@pharnos.com.',
      'This order was not found on this device. Write to contact@pharnos.com.',
    ]))
    return
  }
  S.doc = cmd.doc
  S.pays = cmd.pays
  S.activite = cmd.activite
  S.fichier = cmd.fichier
  remplirPays($('#pays'), S.pays)
  peindreContexte()
  peindreCartes()
  majActivite()
  ouvrirUpgrade(cmd.offre, null)
  poserFichier(cmd.fichier)
  toast(L([
    `Commande ${cmd.id.slice(0, 8)} — votre document a bien été conservé.`,
    `Order ${cmd.id.slice(0, 8)} — your document was kept safely.`,
  ]))
}

/* ══════════════════ Modales ══════════════════ */

const ouvreurs = new Map()
function ouvrirModale(sel, declencheur) {
  const back = $(sel)
  ouvreurs.set(sel, declencheur ?? document.activeElement)
  back.classList.add('on')
  const premier = back.querySelector('.mclose')
  if (premier) premier.focus()
}
function fermerModale(sel) {
  const back = $(sel)
  if (!back.classList.contains('on')) return
  back.classList.remove('on')
  // L'aperçu est libéré : un iframe PDF caché continue de consommer un moteur de rendu.
  if (sel === '#lect') $('#docview').removeAttribute('src')
  const o = ouvreurs.get(sel)
  ouvreurs.delete(sel)
  if (o && typeof o.focus === 'function') o.focus()
}

for (const [sel, bouton] of [
  ['#lect', '#lectclose'],
  ['#upg', '#upgclose'],
]) {
  $(bouton).addEventListener('click', () => fermerModale(sel))
  $(sel).addEventListener('click', (e) => {
    if (e.target === $(sel)) fermerModale(sel)
  })
}

// Échap et Tab agissent sur la modale du DESSUS (la dernière ouverte dans l'ordre du DOM).
document.addEventListener('keydown', (e) => {
  const ouvertes = $$('.modal-back.on')
  if (!ouvertes.length) return
  const back = ouvertes[ouvertes.length - 1]
  if (e.key === 'Escape') {
    fermerModale('#' + back.id)
    return
  }
  if (e.key !== 'Tab') return
  const foc = Array.from(back.querySelectorAll('button, a[href], input, select, textarea')).filter(
    (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
  )
  if (!foc.length) return
  const premier = foc[0]
  const dernier = foc[foc.length - 1]
  if (e.shiftKey && document.activeElement === premier) {
    e.preventDefault()
    dernier.focus()
  } else if (!e.shiftKey && document.activeElement === dernier) {
    e.preventDefault()
    premier.focus()
  }
})

/* ══════════════════ Toast ══════════════════ */

const toastEl = $('#toast')
function toast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('on')
  clearTimeout(toastEl._t)
  toastEl._t = setTimeout(() => toastEl.classList.remove('on'), 4200)
}

/* ══════════════════ Écoutes ══════════════════ */

remplirPays($('#pays'), S.pays)
$('#pays').addEventListener('change', (e) => {
  S.pays = e.target.value
  peindreContexte()
  peindreCartes()
  if ($('#lect').classList.contains('on')) ouvrirLecteur(S.doc, null)
  if ($('#upays').value !== S.pays) $('#upays').value = S.pays
})

$('#upays').addEventListener('change', (e) => {
  // Le pays de la modale COMMANDE le modèle servi : les deux sélecteurs décrivent la même chose,
  // les laisser diverger produirait un devis sur un pays et un fichier sur un autre.
  S.pays = e.target.value
  $('#pays').value = S.pays
  peindreContexte()
  peindreCartes()
})

function majActivite() {
  $$('#uact .chip').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.v === S.activite)))
}
$$('#uact .chip').forEach((c) =>
  c.addEventListener('click', () => {
    S.activite = c.dataset.v
    majActivite()
  }),
)

$('#goup').addEventListener('click', () => {
  fermerModale('#lect')
  ouvrirUpgrade('up1', $('#goup'))
})
$('#goup3').addEventListener('click', () => {
  fermerModale('#lect')
  ouvrirUpgrade('up3', $('#goup3'))
})
$('#buy1').addEventListener('click', () => acheter('up1'))
$('#buy3').addEventListener('click', () => acheter('up3'))

$('#udrop').addEventListener('click', () => $('#ufile').click())
$('#ufile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0]
  if (f) poserFichier(f)
})
$('#ufileclear').addEventListener('click', retirerFichier)

for (const type of ['dragenter', 'dragover']) {
  $('#udrop').addEventListener(type, (e) => {
    e.preventDefault()
    $('#udrop').classList.add('over')
  })
}
for (const type of ['dragleave', 'drop']) {
  $('#udrop').addEventListener(type, (e) => {
    e.preventDefault()
    $('#udrop').classList.remove('over')
    if (type === 'drop' && e.dataTransfer?.files?.[0]) poserFichier(e.dataTransfer.files[0])
  })
}

function appliquerLangue(l) {
  lang = l === 'en' ? 'en' : 'fr'
  remplirPays($('#pays'), S.pays)
  remplirPays($('#upays'), S.pays)
  peindreContexte()
  peindreCartes()
  if ($('#lect').classList.contains('on')) ouvrirLecteur(S.doc, null)
  if ($('#upg').classList.contains('on')) peindreAchat()
  if (S.fichier) $('#ufilesize').textContent = tailleLisible(S.fichier.size, lang)
}
if (window.I18N && typeof window.I18N.on === 'function') window.I18N.on(appliquerLangue)

/* ══════════════════ Amorçage ══════════════════ */

peindreContexte()
peindreCartes()
majActivite()
peindreAchat()
// `varieParPays` sert la recette : elle doit rester vraie pour le RCP et fausse ailleurs.
if (!varieParPays('rcp')) console.warn('bibliotheque : le RCP ne varie plus par pays')
purger().catch((e) => console.error('purge', e))
reprendre().catch((e) => console.error('reprise', e))
