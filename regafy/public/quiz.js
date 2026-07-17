/* Regafy — The UEMOA RA Test (CSP script-src 'self': no inline).
   i18n: English by default, French when the browser language is fr (override: ?lang=fr|en).
   Question content authored/validated by the CEO (RA expert) — 2026-07-17. */

'use strict';

const LANG = (() => {
  const p = new URLSearchParams(location.search).get('lang');
  if (p === 'fr' || p === 'en') return p;
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
})();

/* ── UI strings (HTML ships in English; FR swaps at load) ── */
const UI_FR = {
  title: 'Le Test RA UEMOA — êtes-vous incollable ? · Regafy',
  kicker: 'Quiz · Affaires réglementaires',
  h1: 'Êtes-vous incollable sur la réglementation pharmaceutique UEMOA&nbsp;?',
  lead: '10 questions, des fondamentaux aux subtilités du terrain — langue de soumission, échantillons, variations, renouvellements. <em>Chaque réponse est expliquée et sourcée.</em>',
  chip1: '📋 10 questions',
  chip2: '⏱️ ~3 minutes',
  chip3: '🏅 Votre niveau à la fin',
  start: 'Commencer le test',
  fineprint: "Gratuit, sans inscription. Votre score s'affiche immédiatement — l'e-mail n'est demandé que si vous voulez recevoir le corrigé.",
  gateTitle: 'Recevez votre corrigé détaillé',
  gatePitch: 'Les 10 réponses expliquées, avec <strong>leurs références</strong> — le document que vous garderez sous la main.',
  gateLi1: 'Corrigé complet, envoyé immédiatement',
  gateLi2: 'Votre badge de niveau, partageable sur LinkedIn',
  emailPh: 'votre.nom@laboratoire.com',
  consent: 'Je rejoins aussi <b>Regafy Pulse</b> — la liste privée des experts RA UEMOA/CEDEAO : textes officiels, notes de service, masterclass, actus du secteur. Désinscription en un clic.',
  submit: 'Recevoir le corrigé',
  rgpd: 'Vos données servent uniquement à l’envoi demandé. Abonnement confirmé par double opt-in. <a href="/confidentialite">Politique de confidentialité</a>',
  doneTitle: 'C’est envoyé !',
  doneText: 'Vérifiez votre boîte mail — le corrigé arrive, et si vous avez coché Regafy Pulse, un clic le confirmera.',
  share: 'Défier un confrère sur LinkedIn ↗',
  retry: 'Refaire le test',
  softP: 'Ces questions viennent du référentiel réglementaire vivant de Pharnos.',
  softA: 'Découvrir comment les équipes RA pilotent leurs dossiers avec Pharnos →',
  footer: '© Regafy — un projet <a href="https://pharnos.com" rel="noopener">Pharnos</a> · contenu informatif, ne remplace pas les textes officiels',
  counter: (i, n) => `Question ${i} / ${n}`,
  score: (s) => `Score : ${s}`,
  ok: '✓ Bonne réponse',
  ko: '✗ Pas tout à fait',
  next: 'Question suivante →',
  seeResult: 'Voir mon résultat →',
  invalidEmail: 'Adresse e-mail invalide.',
  sending: 'Envoi en cours…',
  sendFail: "L'envoi n'a pas abouti — réessayez dans un instant.",
};

const UI_EN = {
  counter: (i, n) => `Question ${i} / ${n}`,
  score: (s) => `Score: ${s}`,
  ok: '✓ Correct',
  ko: '✗ Not quite',
  next: 'Next question →',
  seeResult: 'See my result →',
  invalidEmail: 'Invalid email address.',
  sending: 'Sending…',
  sendFail: "That didn't go through — please try again in a moment.",
};

const T = LANG === 'fr' ? UI_FR : UI_EN;

/* ── Questions (answer index identical across languages) ── */
const QUESTIONS_FR = [
  {
    domain: 'Institutions',
    text: "Combien d'États membres compte l'espace UEMOA ?",
    options: ['6', '8', '12', '15'],
    answer: 1,
    explain:
      "Huit : Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal et Togo — un marché pharmaceutique qui partage le franc CFA et un cadre d'harmonisation commun.",
    source: "Traité de l'UEMOA",
  },
  {
    domain: 'Langue de soumission',
    text: "Dans une soumission aux autorités de l'espace UEMOA, quels documents doivent impérativement être en français ?",
    options: [
      'Uniquement le RCP et la notice patient',
      'La correspondance officielle, le RCP, la notice patient et les emballages primaires & secondaires',
      "Uniquement la correspondance officielle avec l'autorité",
      "Aucun — l'anglais est accepté pour tout le dossier",
    ],
    answer: 1,
    explain:
      "Le français s'impose partout où l'autorité et le patient lisent : correspondance officielle, RCP, notice patient et articles de conditionnement primaire et secondaire. Les parties techniques du dossier (modules qualité du CTD) sont plus souvent tolérées en anglais.",
    source: "Pratiques des autorités de l'espace UEMOA",
  },
  {
    domain: 'Harmonisation régionale',
    text: "Quel texte régional harmonise les procédures d'homologation des produits pharmaceutiques à usage humain dans les États membres de l'UEMOA ?",
    options: [
      'La directive n° 03/2006/CM/UEMOA',
      'Le règlement n° 06/2010/CM/UEMOA',
      "La décision n° 09/2015 de l'OOAS",
      'Le protocole de Ouagadougou',
    ],
    answer: 1,
    explain:
      "Le règlement n° 06/2010/CM/UEMOA pose le socle commun des procédures d'homologation dans les huit États membres — le texte de référence de l'harmonisation régionale.",
    source: 'Règlement n° 06/2010/CM/UEMOA',
  },
  {
    domain: "Dossier d'AMM",
    text: "Sous quel format les dossiers de demande d'AMM sont-ils attendus dans l'espace UEMOA ?",
    options: [
      'Format libre, selon le laboratoire',
      'Format CTD (Common Technical Document)',
      'eCTD exclusivement, en soumission électronique',
      'Format ACTD (ASEAN)',
    ],
    answer: 1,
    explain:
      "Le CTD structure le dossier en 5 modules. L'eCTD n'est pas encore une exigence généralisée dans la région — le dossier structuré au format CTD reste la norme.",
    source: "Lignes directrices d'homologation UEMOA",
  },
  {
    domain: 'Échantillons',
    text: 'Quelle durée de vie restante est exigée pour les échantillons soumis avec le dossier ?',
    options: [
      '6 mois minimum',
      '12 mois minimum',
      'Au moins 18 mois, ou les 2/3 de la durée de conservation',
      'Aucune exigence particulière',
    ],
    answer: 2,
    explain:
      'À la soumission, les échantillons doivent conserver au moins 18 mois de validité — ou les deux tiers de leur durée de conservation totale. Un lot trop entamé, et le dossier revient.',
    source: "Pratiques des autorités de l'espace UEMOA",
  },
  {
    domain: 'Fondamentaux',
    text: "Comment s'appelle le document qui autorise officiellement un laboratoire à vendre son médicament dans un pays de l'UEMOA ?",
    options: [
      'Le certificat GMP',
      "L'AMM — Autorisation de Mise sur le Marché",
      'Le CPP',
      "La licence d'exploitation",
    ],
    answer: 1,
    explain:
      "L'AMM est LE sésame : sans elle, pas de commercialisation légale. Le certificat GMP et le CPP sont des pièces du dossier — pas l'autorisation elle-même.",
    source: 'Règlement n° 06/2010/CM/UEMOA',
  },
  {
    domain: 'Cycle de vie',
    text: "Le renouvellement d'une AMM se prépare à partir de combien de temps avant son expiration ?",
    options: ['1 mois', '3 mois', 'Au moins 6 mois', 'Il est automatique'],
    answer: 2,
    explain:
      "Au moins 6 mois avant l'échéance : redevances, documents à jour, échantillons selon les pays… C'est l'échéance la plus souvent ratée par les titulaires.",
    source: "Pratiques des autorités de l'espace UEMOA",
  },
  {
    domain: 'Variations',
    text: "Le changement du nom commercial d'un produit relève de quel type de variation ?",
    options: [
      'Variation majeure',
      'Variation mineure',
      "Nouvelle demande d'AMM complète",
      'Simple information, sans dossier',
    ],
    answer: 1,
    explain:
      "C'est une variation mineure — mais une variation quand même : elle se déclare et se documente auprès de l'autorité.",
    source: 'Lignes directrices variations, espace UEMOA',
  },
  {
    domain: "Dossier d'AMM",
    text: "Quelles pièces administratives sont le plus fréquemment demandées aux laboratoires lors d'une demande d'AMM ?",
    options: [
      'Le certificat GMP uniquement',
      'Certificat GMP, CPP, certificat de libre vente (FSC) et licence de fabrication',
      'Une simple lettre de demande suffit',
      "Le rapport d'audit interne du laboratoire",
    ],
    answer: 1,
    explain:
      'Le quatuor classique : certificat GMP (bonnes pratiques de fabrication), CPP (certificat de produit pharmaceutique, modèle OMS), certificat de libre vente (FSC) et licence de fabrication.',
    source: "Pratiques des autorités de l'espace UEMOA",
  },
  {
    domain: 'Harmonisation continentale',
    text: "L'UEMOA étant un espace économique commun, une AMM obtenue en Côte d'Ivoire permet-elle de vendre légalement au Bénin et au Sénégal sans autorisation supplémentaire ?",
    options: [
      "Oui, l'AMM vaut pour les 8 États",
      'Oui, après une simple notification',
      "Non — chaque État délivre sa propre AMM ; mais l'AMA et l'harmonisation régionale y travaillent",
      "Non, et aucune harmonisation n'est envisagée",
    ],
    answer: 2,
    explain:
      "Chaque autorité nationale délivre sa propre AMM. La bonne nouvelle : l'harmonisation avance — règlement UEMOA, OOAS, et l'Agence africaine du médicament (AMA) préparent la reconnaissance mutuelle de demain.",
    source: 'Traité AMA · règlement n° 06/2010/CM/UEMOA',
  },
];

const QUESTIONS_EN = [
  {
    domain: 'Institutions',
    text: 'How many member states make up the WAEMU (UEMOA) area?',
    options: ['6', '8', '12', '15'],
    answer: 1,
    explain:
      "Eight: Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal and Togo — a pharmaceutical market sharing the CFA franc and a common harmonisation framework.",
    source: 'WAEMU Treaty',
  },
  {
    domain: 'Submission language',
    text: 'In a submission to a WAEMU-area authority, which documents must be in French?',
    options: [
      'Only the SmPC and the patient leaflet',
      'Official correspondence, the SmPC, the patient leaflet, and primary & secondary packaging',
      'Only the official correspondence with the authority',
      'None — English is accepted for the whole dossier',
    ],
    answer: 1,
    explain:
      'French is required wherever the authority and the patient read: official correspondence, the SmPC, the patient leaflet, and primary & secondary packaging components. The technical parts of the dossier (CTD quality modules) are more often accepted in English.',
    source: 'Practice of WAEMU-area authorities',
  },
  {
    domain: 'Regional harmonisation',
    text: 'Which regional text harmonises the marketing-authorisation procedures for human medicines across WAEMU member states?',
    options: [
      'Directive No. 03/2006/CM/UEMOA',
      'Regulation No. 06/2010/CM/UEMOA',
      'WAHO Decision No. 09/2015',
      'The Ouagadougou Protocol',
    ],
    answer: 1,
    explain:
      'Regulation No. 06/2010/CM/UEMOA lays the common foundation for authorisation procedures across the eight member states — the reference text for regional harmonisation.',
    source: 'Regulation No. 06/2010/CM/UEMOA',
  },
  {
    domain: 'MA dossier',
    text: 'In which format are marketing-authorisation dossiers expected in the WAEMU area?',
    options: [
      'Free format, at the company’s discretion',
      'CTD format (Common Technical Document)',
      'eCTD only, submitted electronically',
      'ACTD format (ASEAN)',
    ],
    answer: 1,
    explain:
      'The CTD structures the dossier into 5 modules. eCTD is not yet a general requirement in the region — a structured CTD dossier remains the norm.',
    source: 'WAEMU authorisation guidelines',
  },
  {
    domain: 'Samples',
    text: 'What remaining shelf life is required for samples submitted with the dossier?',
    options: [
      'At least 6 months',
      'At least 12 months',
      'At least 18 months, or two-thirds of the shelf life',
      'No particular requirement',
    ],
    answer: 2,
    explain:
      'At submission, samples must retain at least 18 months of validity — or two-thirds of their total shelf life. Too little left, and the dossier comes back.',
    source: 'Practice of WAEMU-area authorities',
  },
  {
    domain: 'Fundamentals',
    text: 'What is the document that officially authorises a company to market its medicine in a WAEMU country?',
    options: [
      'The GMP certificate',
      'The Marketing Authorisation (MA / AMM)',
      'The CPP',
      'The operating licence',
    ],
    answer: 1,
    explain:
      'The Marketing Authorisation is THE key: without it, no legal marketing. The GMP certificate and the CPP are supporting documents — not the authorisation itself.',
    source: 'Regulation No. 06/2010/CM/UEMOA',
  },
  {
    domain: 'Lifecycle',
    text: 'How long before its expiry should the renewal of a Marketing Authorisation be prepared?',
    options: ['1 month', '3 months', 'At least 6 months', 'Renewal is automatic'],
    answer: 2,
    explain:
      'At least 6 months before expiry: fees, updated documents, samples depending on the country… It is the deadline most often missed by MA holders.',
    source: 'Practice of WAEMU-area authorities',
  },
  {
    domain: 'Variations',
    text: 'A change of a product’s trade name falls under which type of variation?',
    options: [
      'Major variation',
      'Minor variation',
      'A complete new MA application',
      'Simple information, no dossier',
    ],
    answer: 1,
    explain:
      'It is a minor variation — but a variation nonetheless: it must be declared and documented with the authority.',
    source: 'Variation guidelines, WAEMU area',
  },
  {
    domain: 'MA dossier',
    text: 'Which administrative documents are most frequently requested from pharmaceutical companies in an MA application?',
    options: [
      'The GMP certificate only',
      'GMP certificate, CPP, Free Sale Certificate (FSC) and Manufacturing Licence',
      'A simple request letter is enough',
      'The company’s internal audit report',
    ],
    answer: 1,
    explain:
      'The classic quartet: GMP certificate (good manufacturing practice), CPP (Certificate of Pharmaceutical Product, WHO scheme), Free Sale Certificate (FSC) and Manufacturing Licence.',
    source: 'Practice of WAEMU-area authorities',
  },
  {
    domain: 'Continental harmonisation',
    text: 'WAEMU being a common economic area, does an MA obtained in Côte d’Ivoire allow you to sell legally in Benin and Senegal without further authorisation?',
    options: [
      'Yes, the MA is valid across the 8 states',
      'Yes, after a simple notification',
      'No — each state issues its own MA; but the AMA and regional harmonisation are working on it',
      'No, and no harmonisation is planned',
    ],
    answer: 2,
    explain:
      'Each national authority issues its own MA. The good news: harmonisation is moving — the WAEMU regulation, WAHO, and the African Medicines Agency (AMA) are paving the way for tomorrow’s mutual recognition.',
    source: 'AMA Treaty · Regulation No. 06/2010/CM/UEMOA',
  },
];

const QUESTIONS = LANG === 'fr' ? QUESTIONS_FR : QUESTIONS_EN;

const LEVELS_FR = [
  { min: 9, cls: 'gold', icon: '🏅', label: 'Expert régional', sub: 'Impressionnant. Le terrain n’a plus de secret pour vous — vos confrères devraient vous consulter avant chaque dépôt.' },
  { min: 7, cls: 'blue', icon: '🎯', label: 'Confirmé', sub: 'Solide. Il ne vous manque que quelques subtilités — précisément ce qu’une veille continue apporte.' },
  { min: 4, cls: 'blue', icon: '📚', label: 'En progression', sub: 'Les fondamentaux sont là. Les pratiques évoluent vite dans la région — le corrigé va vous être utile.' },
  { min: 0, cls: 'grey', icon: '🧭', label: 'Explorateur', sub: 'L’espace UEMOA a ses règles propres, pays par pays. Bonne nouvelle : le corrigé est un excellent point de départ.' },
];

const LEVELS_EN = [
  { min: 9, cls: 'gold', icon: '🏅', label: 'Regional Expert', sub: 'Impressive. The field holds no secrets for you — your peers should check with you before every submission.' },
  { min: 7, cls: 'blue', icon: '🎯', label: 'Seasoned', sub: 'Solid. Only a few subtleties are missing — exactly what continuous regulatory intelligence brings.' },
  { min: 4, cls: 'blue', icon: '📚', label: 'Building up', sub: 'The fundamentals are there. Practice moves fast in the region — the answer key will serve you well.' },
  { min: 0, cls: 'grey', icon: '🧭', label: 'Explorer', sub: 'The WAEMU area has rules of its own, country by country. Good news: the answer key is a great place to start.' },
];

const LEVELS = LANG === 'fr' ? LEVELS_FR : LEVELS_EN;

let current = 0;
let score = 0;
let answered = false;

const $ = (id) => document.getElementById(id);

/* FR swap of the static English chrome */
function applyLang() {
  if (LANG !== 'fr') return;
  document.documentElement.lang = 'fr';
  document.title = UI_FR.title;
  const set = (id, html) => {
    const el = $(id);
    if (el) el.innerHTML = html;
  };
  set('i-kicker', UI_FR.kicker);
  set('i-h1', UI_FR.h1);
  set('i-lead', UI_FR.lead);
  set('i-chip1', UI_FR.chip1);
  set('i-chip2', UI_FR.chip2);
  set('i-chip3', UI_FR.chip3);
  set('start-btn', UI_FR.start);
  set('i-fineprint', UI_FR.fineprint);
  set('g-title', UI_FR.gateTitle);
  set('g-pitch', UI_FR.gatePitch);
  set('g-li1', UI_FR.gateLi1);
  set('g-li2', UI_FR.gateLi2);
  set('g-consent-text', UI_FR.consent);
  set('gate-submit', UI_FR.submit);
  set('g-rgpd', UI_FR.rgpd);
  set('done-title', UI_FR.doneTitle);
  set('done-text', UI_FR.doneText);
  set('share-btn', UI_FR.share);
  set('retry-btn', UI_FR.retry);
  set('soft-p', UI_FR.softP);
  set('soft-a', UI_FR.softA);
  set('site-footer', UI_FR.footer);
  set('r-den', 'sur 10');
  const email = $('email');
  if (email) email.placeholder = UI_FR.emailPh;
}

function startQuiz() {
  $('screen-intro').classList.add('hidden');
  $('screen-quiz').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  answered = false;
  const q = QUESTIONS[current];
  $('q-counter').textContent = T.counter(current + 1, QUESTIONS.length);
  $('q-score').textContent = T.score(score);
  $('q-progress').style.width = `${(current / QUESTIONS.length) * 100}%`;
  $('q-domain').textContent = q.domain;
  $('q-text').textContent = q.text;
  const box = $('q-options');
  box.textContent = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.type = 'button';
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = 'ABCD'[i];
    const label = document.createElement('span');
    label.textContent = opt;
    b.append(letter, label);
    b.addEventListener('click', () => answer(i));
    box.appendChild(b);
  });
  $('q-explain').classList.remove('show');
  $('q-next-row').classList.remove('show');
}

function answer(i) {
  if (answered) return;
  answered = true;
  const q = QUESTIONS[current];
  const ok = i === q.answer;
  if (ok) score++;
  document.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === q.answer) b.classList.add('correct');
    else if (j === i) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  const v = $('q-verdict');
  v.textContent = ok ? T.ok : T.ko;
  v.className = 'verdict ' + (ok ? 'ok' : 'ko');
  $('q-explain-text').textContent = q.explain;
  $('q-source').textContent = q.source;
  $('q-explain').classList.add('show');
  $('q-score').textContent = T.score(score);
  $('q-next-btn').textContent = current === QUESTIONS.length - 1 ? T.seeResult : T.next;
  $('q-next-row').classList.add('show');
  // Le bouton « suivant » doit être visible sans scroll manuel (recette CEO)
  requestAnimationFrame(() => {
    $('q-next-row').scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}

function nextQuestion() {
  current++;
  if (current < QUESTIONS.length) {
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResult();
  }
}

function showResult() {
  $('screen-quiz').classList.add('hidden');
  $('screen-result').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const lvl = LEVELS.find((l) => score >= l.min);
  const badge = $('r-badge');
  badge.className = 'level-badge ' + lvl.cls;
  badge.textContent = `${lvl.icon} ${lvl.label}`;
  $('r-sub').textContent = lvl.sub;
  let n = 0;
  const numEl = $('r-num');
  const tick = setInterval(() => {
    numEl.textContent = n;
    if (n >= score) clearInterval(tick);
    n++;
  }, 90);
  // setTimeout (pas rAF) : l'anim doit partir même si l'onglet est en arrière-plan
  setTimeout(() => {
    $('ring').style.strokeDashoffset = String(402 - (402 * score) / 10);
  }, 60);
}

async function submitGate(ev) {
  ev.preventDefault();
  const form = $('gate-form');
  const emailEl = $('email');
  const msg = form.querySelector('.form-msg');
  const email = emailEl.value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    msg.textContent = T.invalidEmail;
    msg.className = 'form-msg err';
    emailEl.focus();
    return;
  }
  const btn = $('gate-submit');
  btn.disabled = true;
  msg.textContent = T.sending;
  msg.className = 'form-msg';
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        newsletter: $('consent').checked,
        source: 'quiz',
        score,
        lang: LANG,
        website: form.querySelector('.hp').value,
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    form.style.display = 'none';
    $('gate-done').style.display = 'block';
  } catch {
    btn.disabled = false;
    msg.textContent = T.sendFail;
    msg.className = 'form-msg err';
  }
}

function shareLinkedIn() {
  const url = encodeURIComponent(location.origin + '/');
  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener');
}

applyLang();
$('start-btn').addEventListener('click', startQuiz);
$('q-next-btn').addEventListener('click', nextQuestion);
$('gate-form').addEventListener('submit', submitGate);
$('share-btn').addEventListener('click', shareLinkedIn);
$('retry-btn').addEventListener('click', () => window.location.reload());
