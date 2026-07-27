/* ── Checking Standard — contrôleur de la page /checking-standard.
     Module ES natif : la landing n'a pas d'étape de build, le navigateur charge ces fichiers
     tels quels. La CSP est `script-src 'self'` et `style-src 'self'` :
       • aucun script inline — ce fichier est chargé par <script type="module" src>,
       • aucun attribut `style="…"` produit par innerHTML : ce qui varie se pose par CSSOM
         (`el.style.width`) ou par classe d'état (`.lv-ok`, `.bar-mid`…).
     Tout texte interpolé passe par `esc()` : aujourd'hui le contenu vient de nos modules, mais
     le jour où le barème viendra du référentiel en base, l'échappement sera déjà en place. ── */

import { AXES, GATES, PAYS, SOURCES, UPGRADABLE, optionsFor } from './checking/referentiel.js'
import { BAREME_VERSION, buildFlow, computeResult, THRESHOLD_PARTIAL } from './checking/scoring.js'
import { GROUP_PREFIX, MODELES } from './checking/templates.js'

const $ = (s) => document.querySelector(s)
const $$ = (s) => Array.from(document.querySelectorAll(s))
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Endpoint public de livraison du rapport (Edge Supabase, verify_jwt = false). */
const REPORT_API = 'https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1/checking-report'
/** Numéro WhatsApp officiel Pharnos — à renseigner (format international, sans « + » ni espace).
 *  Vide = le canal WhatsApp annonce son ouverture et renvoie vers l'e-mail ; on n'affiche jamais
 *  un bouton qui ouvrirait une conversation vers un numéro inexistant. */
const WA_NUMBER = ''

/* ══ i18n — les valeurs bilingues s'écrivent ["fr","en"] ══ */
let lang = window.I18N && typeof window.I18N.get === 'function' ? window.I18N.get() : 'fr'
const L = (v) => (Array.isArray(v) ? (v[lang === 'en' ? 1 : 0] ?? v[0]) : v)

/* ══ Devises — prix fixés par marché, jamais convertis à la volée (un taux qui bouge ferait
     varier un prix affiché sans décision commerciale). ══ */
let cur = 'xof'
const PRICE = {
  ai: { xof: 75000, eur: 119 },
  aiLaunch: { xof: 50000, eur: 79 },
  exp: { xof: 250000, eur: 389 },
  sen: { xof: 750000, eur: 1149 },
  up1: { xof: 25000, eur: 39 },
  up3: { xof: 60000, eur: 92 },
}
// Les séparateurs de milliers de toLocaleString sont des espaces INSÉCABLES (U+202F ou U+00A0)
// selon la locale et le moteur. On les normalise par POINT DE CODE : écrits littéralement dans
// une regex, ces caractères sont invisibles à la relecture et se perdent au premier copier-coller.
const fmt = (n) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR').replace(/[\u202F\u00A0]/g, ' ')
const price = (p, alt) =>
  alt
    ? cur === 'eur'
      ? `${fmt(p.xof)} FCFA`
      : `${fmt(p.eur)} €`
    : cur === 'eur'
      ? `${fmt(p.eur)} €`
      : `${fmt(p.xof)} FCFA`

/* ══ État ══ */
/* `answers` porte EXACTEMENT le nom attendu par le moteur : `computeResult(S)` et `buildFlow(S)`
   consomment cet objet tel quel. Un nom divergent ici passerait tous les tests du moteur tout en
   calculant sur un objet vide — le score afficherait 0 sans qu'aucune erreur ne soit levée. */
const S = { pays: 'bj', op: 'enr', type: 'spec', i: 0, answers: {} }
const flow = () => buildFlow(S)
const paysObj = () => PAYS.find((p) => p.k === S.pays) ?? PAYS[0]

/* ══ Contexte ══ */
$('#pays').innerHTML = PAYS.map((p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`).join('')
$('#pays').value = S.pays
$('#pays').addEventListener('change', (e) => {
  S.pays = e.target.value
  recap()
})

function setSeg(groupSel, v) {
  $$(groupSel + ' button').forEach((b) => {
    const on = b.dataset.v === v
    b.classList.toggle('on', on)
    b.setAttribute('aria-pressed', String(on))
  })
}
$$('#op button').forEach((b) =>
  b.addEventListener('click', () => {
    setSeg('#op', b.dataset.v)
    S.op = b.dataset.v
    S.answers = {}
    S.i = 0
    recap()
  }),
)
$$('#type button').forEach((b) =>
  b.addEventListener('click', () => {
    setSeg('#type', b.dataset.v)
    S.type = b.dataset.v
    S.answers = {}
    S.i = 0
    $('#typenote').classList.toggle('on', S.type === 'vac')
    recap()
  }),
)

function recap() {
  const p = paysObj()
  const op = L(S.op === 'enr' ? ['Enregistrement', 'Registration'] : ['Renouvellement', 'Renewal'])
  const type = L({ spec: ['Spécialité', 'Originator'], gen: ['Générique', 'Generic'], vac: ['Vaccin', 'Vaccine'] }[S.type])
  $('#recap').innerHTML =
    `<b>${esc(op)}</b> · ${esc(type)} · ${esc(L(p.nom))} — ` +
    `<b>${flow().length}</b> ${esc(L(['questions · ~3 minutes', 'questions · ~3 minutes']))}`
}

/* ══ Navigation entre panneaux ══ */
function show(id) {
  $$('.panel').forEach((p) => p.classList.toggle('on', '#' + p.id === id))
  const y = $('#diagnostic').getBoundingClientRect().top + window.scrollY - 70
  if (Math.abs(window.scrollY - y) > 120) window.scrollTo({ top: y, behavior: RM ? 'auto' : 'smooth' })
}
/* `show()` AVANT de poser le focus : un panneau encore en `display:none` n'accepte pas le focus,
   l'appel échoue en silence et le clavier repart du haut du document à chaque étape. */
$('#startBtn').addEventListener('click', () => {
  S.i = 0
  S.answers = {}
  show('#p-q')
  renderQ()
})
$('#restart').addEventListener('click', () => {
  S.i = 0
  S.answers = {}
  lastResult = null
  recap()
  show('#p-ctx')
  $('#p-ctx').querySelector('h2').focus({ preventScroll: true })
})

/* ══ Verrous de réception (HUD) ══ */
function renderLocks(el) {
  const state = {}
  for (const it of flow()) if (it.gate) state[it.gate] = S.answers[it.id]
  el.innerHTML = Object.keys(GATES)
    .map((k) => {
      const a = state[k]
      const cls = a === 'ok' ? 'ok' : a == null ? '' : 'ko'
      const ico = a === 'ok' ? '✓' : a == null ? '🔒' : '✗'
      return `<span class="lock ${cls}"><span aria-hidden="true">${ico}</span> ${esc(L(GATES[k]))}</span>`
    })
    .join('')
}

/* ══ Questionnaire ══ */
function renderQ() {
  const f = flow()
  const it = f[S.i]
  if (!it) return
  const answered = f.filter((x) => S.answers[x.id] != null).length

  $('#qcount').textContent = `${S.i + 1} / ${f.length}`
  $('#qfill').style.width = (answered / f.length) * 100 + '%'
  renderLocks($('#locks'))

  $('#qdots').innerHTML = f
    .map((x, j) => {
      const done = S.answers[x.id] != null
      const label = `${L(['Question', 'Question'])} ${j + 1}${done ? L([' (répondue)', ' (answered)']) : ''}`
      return `<button type="button" class="qdot ${done ? 'done' : ''} ${j === S.i ? 'now' : ''}" data-j="${j}" ${
        done || j === S.i ? '' : 'disabled'
      } aria-label="${esc(label)}" ${j === S.i ? 'aria-current="step"' : ''}></button>`
    })
    .join('')
  $$('#qdots .qdot.done').forEach((d) =>
    d.addEventListener('click', () => {
      clearTimeout(pending)
      pending = null
      S.i = Number(d.dataset.j)
      renderQ()
    }),
  )

  $('#qkick').innerHTML =
    `<span class="pill">${esc(L(AXES[it.axis]))}</span>` +
    (it.gate ? `<span class="pill gate">🔒 ${esc(L(['Verrou de réception', 'Reception gate']))}</span>` : '') +
    `<span class="pill src">${esc(L(SOURCES[S.op] ?? SOURCES.enr))}</span>`

  $('#qtext').textContent = L(it.q)
  $('#qwhy').textContent = L(it.why)

  // Barre « voir le modèle » : seulement pour les pièces opposables à un modèle officiel.
  const bar = $('#tplbar')
  if (it.tpl && MODELES[it.tpl]) {
    bar.hidden = false
    $('#tpltext').textContent = L([
      `Ce document est opposable à un modèle officiel — regardez-le avant de répondre.`,
      `This document is checked against an official template — look at it before answering.`,
    ])
    $('#tplbtn').onclick = () => openTpl(it.tpl, $('#tplbtn'))
  } else {
    bar.hidden = true
    $('#tplbtn').onclick = null
  }

  const opts = optionsFor(it)
  $('#qopts').innerHTML = opts
    .map(
      (o, k) =>
        `<button type="button" class="opt ${S.answers[it.id] === o.k ? 'sel-' + o.cls : ''}" aria-pressed="${S.answers[it.id] === o.k}" data-k="${esc(o.k)}" data-cls="${esc(o.cls)}">
           <span class="key" aria-hidden="true">${k + 1}</span><span class="ico" aria-hidden="true">${esc(o.ico)}</span>
           <span>${esc(L(o.label))}<small>${esc(L(o.sub))}</small></span>
         </button>`,
    )
    .join('')
  $$('#qopts .opt').forEach((b) => b.addEventListener('click', () => pick(it, b)))

  $('#qback').disabled = S.i === 0
  const allDone = f.every((x) => S.answers[x.id] != null)
  const nxt = $('#qnext')
  nxt.hidden = S.answers[it.id] == null
  nxt.textContent = allDone ? L(['Voir mon résultat →', 'See my result →']) : L(['Suivant →', 'Next →'])
  // Le panneau doit être visible pour recevoir le focus (cf. l'ordre show() → renderQ()).
  if ($('#p-q').classList.contains('on')) $('#qtext').focus({ preventScroll: true })
}

/* Avance vers la première question SANS réponse — jamais « la suivante par position » : sinon
   revenir corriger une réponse au milieu du parcours oblige à re-répondre tout ce qui suit. */
let pending = null
function advance() {
  pending = null
  const f = flow()
  const hole = f.findIndex((x) => S.answers[x.id] == null)
  if (hole === -1) {
    computeAndShow()
    return
  }
  const next = f.findIndex((x, j) => j > S.i && S.answers[x.id] == null)
  S.i = next !== -1 ? next : hole
  renderQ()
}

function pick(it, btn) {
  S.answers[it.id] = btn.dataset.k
  $$('#qopts .opt').forEach((x) => {
    x.classList.remove('sel-ok', 'sel-nc', 'sel-ko', 'sel-na')
    x.setAttribute('aria-pressed', 'false')
  })
  btn.classList.add('sel-' + btn.dataset.cls)
  btn.setAttribute('aria-pressed', 'true')
  renderLocks($('#locks'))
  const f = flow()
  $('#qfill').style.width = (f.filter((x) => S.answers[x.id] != null).length / f.length) * 100 + '%'
  // Un seul minuteur en vol : deux clics rapprochés ne doivent pas sauter une question.
  clearTimeout(pending)
  pending = setTimeout(advance, 320)
}

$('#qback').addEventListener('click', () => {
  clearTimeout(pending)
  pending = null
  if (S.i > 0) {
    S.i--
    renderQ()
  }
})
$('#qnext').addEventListener('click', () => {
  clearTimeout(pending)
  advance()
})

document.addEventListener('keydown', (e) => {
  if (!$('#p-q').classList.contains('on')) return
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
  if ($$('.modal-back.on').length) return
  const it = flow()[S.i]
  if (!it) return
  const n = parseInt(e.key, 10)
  if (n >= 1 && n <= optionsFor(it).length) {
    const b = $$('#qopts .opt')[n - 1]
    if (b) b.click()
  }
  if (e.key === 'ArrowLeft' && S.i > 0) {
    e.preventDefault()
    clearTimeout(pending)
    pending = null
    S.i--
    renderQ()
  }
})

/* ══ Résultat ══ */
let lastResult = null

function fixText(it, kind) {
  if (it.fixMap) return L(it.fixMap[kind])
  if (kind === 'ko') return L(['À prévoir : ', 'To prepare: ']) + L(it.piece) + '.'
  const note = it.ncNote ? L([` — écart relevé : « ${L(it.ncNote)} »`, ` — gap noted: “${L(it.ncNote)}”`]) : ''
  return L(['À reprendre : ', 'To rework: ']) + L(it.piece) + note + '.'
}

function computeAndShow() {
  lastResult = computeResult(S)
  renderResult(lastResult)
  show('#p-res')
  // Le bouton de réponse qui portait le focus vient de disparaître avec le panneau : sans cette
  // reprise, un utilisateur au clavier est renvoyé en haut du document au moment du verdict.
  $('#rverdict').focus({ preventScroll: true })
}

function renderResult(r) {
  const f = flow()
  const byId = new Map(f.map((it) => [it.id, it]))
  const p = paysObj()
  const opTxt = L(S.op === 'enr' ? ['Enregistrement', 'Registration'] : ['Renouvellement', 'Renewal'])

  $('#rpills').innerHTML =
    `<span class="pill op">${esc(opTxt)}</span>` +
    `<span class="pill">${esc(L({ spec: ['Spécialité', 'Originator'], gen: ['Générique', 'Generic'], vac: ['Vaccin', 'Vaccine'] }[S.type]))}</span>` +
    `<span class="pill">${esc(L(p.nom))} · ${esc(L(['norme de réception de', 'reception standard of']))} ${esc(L(p.ag))}</span>`

  // Jauge : le score EST le chiffre affiché ; l'aiguille se positionne dessus.
  animateNum($('#rscore'), r.score)
  $('#rneedle').style.left = `calc(${r.score}% - 4px)`

  const v = $('#rverdict')
  const VERDICTS = {
    gate_fail: {
      cls: 'v-ko',
      txt: ['✗ Verrou de réception non satisfait', '✗ Reception gate not met'],
      sub: [
        `Au moins un verrou de réception n'est pas prêt. L'Annexe IV du Règlement 04/2020 en fait un motif de refus de réception par ${L(p.ag)}. Traitez ces points avant toute autre correction.`,
        `At least one reception gate is not ready. Annex IV of Regulation 04/2020 makes it a ground for refusal of reception by ${L(p.ag)}. Address these points before any other correction.`,
      ],
    },
    ready: {
      cls: 'v-ok',
      txt: ['✓ Dossier prêt pour le dépôt', '✓ Dossier ready for filing'],
      sub: [
        "Votre déclaration couvre les exigences de réception. Reste le contenu réel des pièces : c'est l'objet d'un audit.",
        'Your declaration covers the reception requirements. What remains is the actual content of each document: that is what an audit covers.',
      ],
    },
    incomplete: {
      cls: 'v-mid',
      txt: ['△ Dossier incomplet — à sécuriser avant dépôt', '△ Incomplete dossier — secure before filing'],
      sub: [
        "La structure est en place, mais des pièces manquent ou s'écartent des modèles officiels. Chaque écart relevé en réception coûte des semaines d'aller-retour.",
        'The structure is in place, but documents are missing or deviate from the official templates. Every gap raised at reception costs weeks of back-and-forth.',
      ],
    },
    not_ready: {
      cls: 'v-ko',
      txt: ['✗ Dossier non prêt pour le dépôt', '✗ Dossier not ready for filing'],
      sub: [
        'Trop de pièces restent à produire ou à mettre en conformité. Déroulez le plan ci-dessous, puis relancez le diagnostic — il est gratuit et illimité.',
        'Too many documents remain to be produced or brought into compliance. Work through the plan below, then run the diagnostic again — it is free and unlimited.',
      ],
    },
  }
  const vd = VERDICTS[r.verdict]
  v.className = 'verdict ' + vd.cls
  v.textContent = L(vd.txt)
  $('#rsub').textContent = L(vd.sub)

  $('#rscope').innerHTML =
    '<b>' +
    esc(L(['Portée du diagnostic. ', 'Scope of this diagnostic. '])) +
    '</b>' +
    esc(
      L([
        `Le Checking Standard mesure la complétude de votre dossier au regard des exigences publiées — Règlement n° 04/2020/CM/UEMOA et exigences nationales de ${L(p.ag)}. Il porte sur ce que vous déclarez et ne préjuge pas du contenu réel des pièces. Il ne constitue ni un avis ni une décision de l'autorité compétente : la recevabilité relève exclusivement de ${L(p.ag)}.`,
        `The Checking Standard measures the completeness of your dossier against published requirements — Regulation No. 04/2020/CM/UEMOA and the national requirements of ${L(p.ag)}. It covers what you declare and does not prejudge the actual content of your documents. It is neither an opinion nor a decision of the competent authority: admissibility rests solely with ${L(p.ag)}.`,
      ]),
    )

  renderLocks($('#rlocks'))

  // Axes : la couleur passe par une CLASSE (la CSP interdit un `style="background:…"` généré).
  $('#raxes').innerHTML = r.axes
    .map((a) => {
      const lv = a.pct >= 85 ? 'lv-ok' : a.pct >= THRESHOLD_PARTIAL ? 'lv-mid' : 'lv-ko'
      return `<div class="axis"><div class="lbl"><span>${esc(L(AXES[a.key]))}</span><span>${a.pct} %</span></div>
        <div class="bar"><i class="${lv}" data-pct="${a.pct}"></i></div></div>`
    })
    .join('')
  $$('#raxes .bar i').forEach((el) => {
    el.style.width = el.dataset.pct + '%'
  })

  $('#rgates').innerHTML =
    esc(L(['Verrous de réception : ', 'Reception gates: '])) +
    `<b>${r.gateOk} / ${r.gateTotal}</b>` +
    esc(L([' satisfaits', ' met']))

  // Fiche de complétude simulée — le format exact de l'examinateur. Les réponses viennent de
  // l'INSTANTANÉ porté par le résultat, pas de l'état vivant : la fiche affichée décrit toujours
  // le calcul affiché juste au-dessus, même si la page a bougé entre-temps.
  $('#rfref').textContent = `${opTxt} · ${L(p.nom)} · Checking Standard · ${BAREME_VERSION}`
  $('#rfbody').innerHTML = f
    .filter((it) => it.fiche !== false)
    .map((it) => {
      const a = r.answers[it.id]
      const oui = a === 'ok' || a === 'nc'
      const non = a !== 'ok' && a !== 'nc' && a !== 'na'
      const piece = L(it.piece)
      const note =
        a === 'nc'
          ? `<span class="note">${esc(L(it.ncNote) || L(['Présent mais non conforme', 'Present but not compliant']))}</span>`
          : a === 'na'
            ? `<span class="note na">${esc(L(['Non applicable', 'Not applicable']))}</span>`
            : ''
      return `<tr><td>${esc(piece.charAt(0).toUpperCase() + piece.slice(1))}${note}</td>
        <td class="c x">${oui ? 'X' : ''}</td><td class="c x">${non ? 'X' : ''}</td></tr>`
    })
    .join('')

  $('#ravis').className = 'avis-chip ' + (r.complete ? 'ok' : 'ko')
  $('#ravis').textContent = r.complete ? L(['Complet ☑', 'Complete ☑']) : L(['Incomplet ☒', 'Incomplete ☒'])

  // Plan de préparation, déjà trié par le moteur (verrous d'abord).
  $('#rmisswrap').hidden = r.missing.length === 0
  $('#rmiss').innerHTML = r.missing
    .map((m, i) => {
      const it = byId.get(m.id)
      if (!it) return ''
      const fix =
        m.tpl && UPGRADABLE.includes(m.tpl)
          ? `<button type="button" class="fixbtn" data-fixtpl="${esc(m.tpl)}">${esc(L(['Voir le modèle', 'View template']))}</button>`
          : ''
      return `<li class="${m.kind === 'nc' ? 'warn' : ''}"><span class="n">${i + 1}</span><span>${esc(fixText(it, m.kind))}</span>${fix}</li>`
    })
    .join('')
  $$('#rmiss .fixbtn').forEach((b) => b.addEventListener('click', () => openTpl(b.dataset.fixtpl, b)))

  const nb = []
  if (!r.complete)
    nb.push(
      L([
        "En conditions réelles, l'autorité notifie les manquants avec un délai de mise en conformité ; passé ce délai, la demande est clôturée sur la plateforme de soumission et une nouvelle soumission — redevances comprises — devient nécessaire.",
        'In real conditions, the authority notifies the gaps with a compliance deadline; once that deadline passes, the application is closed on the submission platform and a new submission — fees included — becomes necessary.',
      ]),
    )
  const FLAGS = {
    timing_nc: [
      "Le délai réglementaire de 120 jours avant expiration n'est pas respecté. Déposez sans attendre et signalez le calendrier à l'autorité.",
      'The regulatory 120-day pre-expiry deadline is not met. File without delay and flag the timeline to the authority.',
    ],
    timing_ko: [
      "L'AMM est expirée : la voie du renouvellement est fermée. Confirmez le circuit applicable auprès de l'autorité avant d'engager des redevances.",
      'The MA has expired: the renewal route is closed. Confirm the applicable route with the authority before committing any fees.',
    ],
  }
  for (const k of r.flags) if (FLAGS[k]) nb.push(L(FLAGS[k]))
  $('#rnb').hidden = nb.length === 0
  $('#rnb').innerHTML = '<b>NB — </b>' + nb.map(esc).join(' ')
}

let numRun = 0
function animateNum(el, target) {
  const my = ++numRun
  const paint = (n) => {
    el.innerHTML = `${n} <small>/ 100</small>`
  }
  if (RM) {
    paint(target)
    return
  }
  const t0 = performance.now()
  const step = (t) => {
    if (my !== numRun) return
    const k = Math.min(1, (t - t0) / 1000)
    paint(Math.round(target * (1 - Math.pow(1 - k, 3))))
    if (k < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/* ══ Prévisualiseur de modèle officiel ══ */
let curTpl = null
function openTpl(key, opener) {
  const t = MODELES[key]
  if (!t) return
  curTpl = key
  $('#tplkick').textContent = L(['Modèle officiel', 'Official template'])
  $('#tpltitle').textContent = L(t.nom)
  $('#tplsrc').textContent = t.perCountry
    ? `${L(t.src)} · ${L(['adapté au pays sélectionné', 'adapted to the selected country'])} : ${L(paysObj().nom)}`
    : L(t.src)

  $('#tplpage').innerHTML =
    `<div class="doct">${esc(L(t.doct))}</div>` +
    t.secs
      .map((s) => {
        const title = L([s[0], s[1]])
        if (String(title).startsWith(GROUP_PREFIX))
          return `<div class="grp">${esc(String(title).slice(GROUP_PREFIX.length))}</div>`
        const sub = s[2] ? `<div class="sub2">${esc(L(s[2]))}</div>` : ''
        return `<div class="sec"><b>${esc(title)}</b>${sub}</div>`
      })
      .join('')

  $('#tplrules').innerHTML = t.rules.map((r) => `<li>${esc(L(r))}</li>`).join('')
  $('#tplup').hidden = !UPGRADABLE.includes(key)
  openModal('#tplmodal', opener)
}
$('#tplup').addEventListener('click', () => {
  if (!curTpl) return
  closeModal('#tplmodal')
  openUpgrade(curTpl)
})

/* ══ Mise à niveau documentaire ══ */
function openUpgrade(key) {
  const t = MODELES[key]
  if (!t) return
  $('#uptitle').textContent = L([`Mettre ${L(t.short)} au standard officiel`, `Bring ${L(t.short)} up to the official standard`])
  $('#updesc').textContent = L([
    `Regafy AI reprend votre document et le reconstruit sur le modèle de ${L(paysObj().ag)}, rubrique par rubrique. Vous recevez un Word éditable et son PDF.`,
    `Regafy AI takes your document and rebuilds it on the ${L(paysObj().ag)} template, section by section. You receive an editable Word file and its PDF.`,
  ])
  const ROWS = [
    { k: 'up1', t: ['Un document', 'One document'], s: ['RCP, notice ou étiquetage', 'SmPC, leaflet or labelling'], p: PRICE.up1 },
    {
      k: 'up3',
      t: ['Les trois documents', 'All three documents'],
      s: ['RCP + notice + étiquetage, mis en cohérence entre eux', 'SmPC + leaflet + labelling, made consistent with each other'],
      p: PRICE.up3,
      save: true,
    },
  ]
  $('#uppick').innerHTML = ROWS.map(
    (r, i) =>
      `<button type="button" class="uprow ${i === 1 ? 'on' : ''}" data-up="${esc(r.k)}">
         <span class="rt"><b>${esc(L(r.t))}${r.save ? `<span class="upsave">−20 %</span>` : ''}</b><span>${esc(L(r.s))}</span></span>
         <span class="rp">${esc(price(r.p))}<small>${esc(price(r.p, true))}</small></span>
       </button>`,
  ).join('')
  $$('#uppick .uprow').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#uppick .uprow').forEach((x) => x.classList.remove('on'))
      b.classList.add('on')
    }),
  )
  const subject = L([`Mise à niveau documentaire — ${L(t.nom)}`, `Document upgrade — ${L(t.nom)}`])
  $('#upgo').href = `mailto:contact@pharnos.com?subject=${encodeURIComponent(subject)}`
  openModal('#upmodal', null)
}

/* ══ Modale d'offre ══ */
const OFFERS = {
  ai: {
    kick: ['Niveau 1 — automatisé', 'Level 1 — automated'],
    t: ['Audit Regafy AI', 'Regafy AI Audit'],
    d: [
      "Le moteur d'audit du CTD Builder, en version renforcée : plus de 200 points de contrôle sur la structure CTD, les pièces, les formats et la conformité aux modèles officiels.",
      'The CTD Builder audit engine in a reinforced version: over 200 checkpoints on CTD structure, documents, formats and conformity with the official templates.',
    ],
    p: () => price(PRICE.ai),
    per: ['par dossier et par pays', 'per dossier, per country'],
    steps: [
      ['Vous commandez et réglez l’audit', 'You order and pay for the audit'],
      ['Un espace chiffré s’ouvre pour déposer votre Module 1', 'An encrypted space opens for you to upload your Module 1'],
      ['Le rapport annoté arrive quelques minutes après le paiement', 'The annotated report arrives a few minutes after payment'],
      ['Re-scan gratuit une fois vos corrections faites', 'Free re-scan once your corrections are made'],
    ],
  },
  exp: {
    kick: ['Niveau 2 — expert humain', 'Level 2 — human expert'],
    t: ['Audit Expert RA', 'RA Expert Audit'],
    d: [
      "Un expert RA de la zone UEMOA relit votre dossier ligne à ligne, comme le ferait un examinateur, et vous restitue de vive voix.",
      'A WAEMU regulatory affairs expert reviews your dossier line by line, the way an assessor would, and debriefs you in person.',
    ],
    p: () => price(PRICE.exp),
    per: ['par dossier et par pays · 7 jours ouvrés', 'per dossier, per country · 7 working days'],
    steps: [
      ['Commande, puis dépôt dans l’espace chiffré', 'Order, then upload to the encrypted space'],
      ['Audit automatisé, puis revue humaine de chaque pièce', 'Automated audit, then human review of every document'],
      ['Rapport d’expertise et plan d’action sous 7 jours ouvrés', 'Expert report and action plan within 7 working days'],
      ['Restitution visio de 45 min, puis 7 jours de questions-réponses', '45-minute video debrief, then 7 days of written Q&A'],
    ],
  },
  sen: {
    kick: ['Niveau 3 — expert senior', 'Level 3 — senior expert'],
    t: ['Audit Expert Senior RA', 'Senior RA Expert Audit'],
    d: [
      "Docteur en pharmacie ou ancien cadre d'agence nationale : audit approfondi du Module 1, cohérence avec les Modules 2 à 5, stratégie multi-pays et masterclass privée pour votre équipe.",
      'A doctor of pharmacy or former national agency executive: in-depth Module 1 audit, consistency with Modules 2–5, multi-country strategy and a private masterclass for your team.',
    ],
    p: () => L([`à partir de ${price(PRICE.sen)}`, `from ${price(PRICE.sen)}`]),
    per: ['multi-pays sur devis · 10 jours ouvrés', 'multi-country on quotation · 10 working days'],
    steps: [
      ['Échange de cadrage et devis', 'Scoping call and quotation'],
      ['Audit approfondi Module 1 et cohérence Modules 2 à 5', 'In-depth Module 1 audit and Module 2–5 consistency'],
      ['Rapport signé et stratégie de dépôt multi-pays, sous 10 jours ouvrés', 'Signed report and multi-country filing strategy, within 10 working days'],
      ['Masterclass privée de 2 h et hotline 30 jours', '2-hour private masterclass and 30-day hotline'],
    ],
  },
}
$$('[data-offer]').forEach((b) =>
  b.addEventListener('click', () => {
    const o = OFFERS[b.dataset.offer]
    if (!o) return
    $('#mkick').textContent = L(o.kick)
    $('#mtitle').textContent = L(o.t)
    $('#mdesc').textContent = L(o.d)
    $('#mprice').textContent = o.p()
    $('#mper').textContent = L(o.per)
    $('#msteps').innerHTML = o.steps
      .map((s, i) => `<div><span class="s">${i + 1}</span><span>${esc(L(s))}</span></div>`)
      .join('')
    $('#mgo').href = `mailto:contact@pharnos.com?subject=${encodeURIComponent(L(o.t))}`
    openModal('#modal', b)
  }),
)

/* ══ Modales : ouverture, fermeture, focus et piège à tabulation ══ */
const openers = new Map()
function openModal(sel, opener) {
  const back = $(sel)
  openers.set(sel, opener ?? document.activeElement)
  back.classList.add('on')
  const first = back.querySelector('.mclose')
  if (first) first.focus()
}
function closeModal(sel) {
  const back = $(sel)
  if (!back.classList.contains('on')) return
  back.classList.remove('on')
  const o = openers.get(sel)
  openers.delete(sel)
  if (o && typeof o.focus === 'function') o.focus()
}
;[
  ['#modal', '#mclose', '#mcancel'],
  ['#tplmodal', '#tplclose', null],
  ['#upmodal', '#upclose', '#upcancel'],
].forEach(([sel, closeBtn, cancelBtn]) => {
  $(closeBtn).addEventListener('click', () => closeModal(sel))
  if (cancelBtn) $(cancelBtn).addEventListener('click', () => closeModal(sel))
  $(sel).addEventListener('click', (e) => {
    if (e.target === $(sel)) closeModal(sel)
  })
})
// Échap et Tab agissent sur la modale du DESSUS (la dernière ouverte dans l'ordre du DOM).
document.addEventListener('keydown', (e) => {
  const open = $$('.modal-back.on')
  if (!open.length) return
  const back = open[open.length - 1]
  if (e.key === 'Escape') {
    closeModal('#' + back.id)
    return
  }
  if (e.key !== 'Tab') return
  const foc = Array.from(back.querySelectorAll('button, a[href], input, select, textarea')).filter(
    (el) => !el.disabled && !el.hidden && el.offsetParent !== null,
  )
  if (!foc.length) return
  const first = foc[0]
  const last = foc[foc.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
})

/* ══ Prix affichés dans les cartes ══ */
function paintPrices() {
  const map = {
    ai: { p: PRICE.ai, per: ['par dossier et par pays', 'per dossier, per country'], launch: PRICE.aiLaunch },
    exp: { p: PRICE.exp, per: ['par dossier et par pays', 'per dossier, per country'] },
    sen: { p: PRICE.sen, per: ['multi-pays sur devis', 'multi-country on quotation'], from: true },
  }
  $$('[data-price]').forEach((el) => {
    const m = map[el.dataset.price]
    if (!m) return
    const launch = m.launch
      ? `<span class="launch">${esc(L(['Lancement : ', 'Launch offer: ']))}${esc(price(m.launch))}</span>`
      : ''
    el.innerHTML =
      (m.from ? `<span class="from">${esc(L(['à partir de', 'from']))}</span>` : '') +
      `<b>${esc(price(m.p))}</b> <span class="unit">${esc(L(m.per))}</span>` +
      `<span class="alt">${esc(price(m.p, true))}</span>` +
      launch
  })
}

/* ══ Bascules langue et devise ══ */
function applyLang(l) {
  lang = l === 'en' ? 'en' : 'fr'
  const sel = $('#pays')
  sel.innerHTML = PAYS.map((p) => `<option value="${esc(p.k)}">${esc(L(p.nom))}</option>`).join('')
  sel.value = S.pays
  recap()
  paintPrices()
  if ($('#p-q').classList.contains('on')) renderQ()
  if ($('#p-res').classList.contains('on') && lastResult) renderResult(lastResult)
  if (curTpl && $('#tplmodal').classList.contains('on')) openTpl(curTpl, null)
}
if (window.I18N && typeof window.I18N.on === 'function') window.I18N.on(applyLang)

$$('.cur button').forEach((b) =>
  b.addEventListener('click', () => {
    cur = b.dataset.cur === 'eur' ? 'eur' : 'xof'
    $$('.cur button').forEach((x) => {
      const on = x.dataset.cur === cur
      x.classList.toggle('on', on)
      x.setAttribute('aria-pressed', String(on))
    })
    paintPrices()
  }),
)

/* ══ Exemple — un dossier industriel réel, anonymisé ══ */
$('#demoBtn').addEventListener('click', () => {
  S.pays = 'bj'
  S.op = 'enr'
  S.type = 'gen'
  S.i = 0
  $('#pays').value = 'bj'
  setSeg('#op', 'enr')
  setSeg('#type', 'gen')
  $('#typenote').classList.remove('on')
  S.answers = {
    m1: 'nc',
    rcp: 'nc',
    not: 'nc',
    etiq: 'ok',
    btif: 'ko',
    dis: 'ko',
    pgr: 'na',
    dmf: 'na',
    m2: 'ok',
    qos: 'ok',
    m3: 'ok',
    m4: 'ok',
    m5: 'ok',
    ech: 'ok',
    pay: 'ko',
  }
  recap()
  computeAndShow()
  toast(L(['Exemple : un dossier industriel réel, tel que reçu en réception', 'Example: a real industrial dossier, as received at reception']))
})

/* ══ Livraison du rapport ══ */
const toastEl = $('#toast')
function toast(msg) {
  toastEl.textContent = msg
  toastEl.classList.add('on')
  clearTimeout(toastEl._t)
  toastEl._t = setTimeout(() => toastEl.classList.remove('on'), 3600)
}

/** Payload strictement borné : contexte, réponses et contact. AUCUNE donnée produit. */
function reportPayload(channel, contact) {
  return {
    lang,
    channel,
    contact,
    pays: S.pays,
    op: S.op,
    type: S.type,
    answers: S.answers,
    newsletter: $('#cPulse').checked,
    // Le serveur revérifie et REFUSE sans ce drapeau : la case cochée ici n'est pas une preuve,
    // et c'est elle qui autorise à la fois l'envoi et la conservation du contact.
    consent: $('#cReport').checked,
    website: $('#cs-website').value,
  }
}

function requireConsent() {
  if ($('#cReport').checked) return true
  toast(L(['Cochez la case « envoi du rapport » pour le recevoir', 'Tick the “send my report” box to receive it']))
  $('#cReport').focus()
  return false
}

let sending = false
async function sendReport(channel, input) {
  if (sending) return
  const value = input.value.trim()
  const ok = channel === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : value.length >= 6
  if (!ok) {
    input.setAttribute('aria-invalid', 'true')
    input.focus()
    toast(
      channel === 'email'
        ? L(['Saisissez une adresse e-mail professionnelle valide', 'Enter a valid work e-mail address'])
        : L(['Saisissez votre numéro WhatsApp', 'Enter your WhatsApp number']),
    )
    return
  }
  input.removeAttribute('aria-invalid')
  sending = true
  const btn = channel === 'email' ? $('#sendMail') : $('#sendWa')
  const label = btn.textContent
  btn.disabled = true
  btn.textContent = L(['Envoi…', 'Sending…'])
  try {
    const res = await fetch(REPORT_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportPayload(channel, value)),
      // Sans borne, un réseau qui pend laisse le bouton bloqué sur « Envoi… » indéfiniment.
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) {
      toast(
        channel === 'email'
          ? L(['Rapport envoyé — vérifiez votre boîte de réception.', 'Report sent — check your inbox.'])
          : L(['Demande enregistrée — nous vous écrivons sur WhatsApp.', 'Request recorded — we will message you on WhatsApp.']),
      )
    } else if (res.status === 429) {
      toast(L(['Trop de demandes — réessayez dans quelques minutes.', 'Too many requests — try again in a few minutes.']))
    } else {
      toast(L(['Envoi impossible pour le moment — écrivez-nous à contact@pharnos.com.', 'Could not send right now — write to contact@pharnos.com.']))
    }
  } catch {
    toast(L(['Envoi impossible pour le moment — écrivez-nous à contact@pharnos.com.', 'Could not send right now — write to contact@pharnos.com.']))
  } finally {
    sending = false
    btn.disabled = false
    btn.textContent = label
  }
}

$('#sendMail').addEventListener('click', () => {
  if (!requireConsent()) return
  sendReport('email', $('#demail'))
})
// Les champs ne vivent pas dans un <form> (aucune soumission navigateur à intercepter) : Entrée
// doit quand même déclencher l'envoi, c'est le réflexe de tout le monde dans un champ e-mail.
for (const [input, btn] of [
  ['#demail', '#sendMail'],
  ['#dwa', '#sendWa'],
]) {
  $(input).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      $(btn).click()
    }
  })
}
$('#sendWa').addEventListener('click', () => {
  if (!requireConsent()) return
  if (!WA_NUMBER) {
    sendReport('whatsapp', $('#dwa'))
    return
  }
  const r = lastResult
  const summary = L([
    `Bonjour Pharnos, voici mon Checking Standard : ${r ? r.score : '—'}/100, ${r ? r.gateOk : '—'}/${r ? r.gateTotal : '—'} verrous de réception. Merci de m'envoyer le rapport détaillé.`,
    `Hello Pharnos, here is my Checking Standard: ${r ? r.score : '—'}/100, ${r ? r.gateOk : '—'}/${r ? r.gateTotal : '—'} reception gates. Please send me the detailed report.`,
  ])
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(summary)}`, '_blank', 'noopener')
})

/* ══ Amorçage ══ */
setSeg('#op', S.op)
setSeg('#type', S.type)
recap()
paintPrices()
