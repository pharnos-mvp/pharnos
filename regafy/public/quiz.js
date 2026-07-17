/* Le Test RA UEMOA — logique du quiz (CSP script-src 'self' : aucun inline).
   Questions issues du référentiel Pharnos (roadmap-data.ts / fiches Autorités) — contenu validé CEO. */

'use strict';

const QUESTIONS = [
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
    domain: 'Institutions · Sénégal',
    text: "Au Sénégal, quelle autorité délivre aujourd'hui les autorisations de mise sur le marché (AMM) ?",
    options: [
      'La DPM (Direction de la Pharmacie et du Médicament)',
      "L'ARP (Agence sénégalaise de Réglementation Pharmaceutique)",
      'Le LNCM',
      "L'Ordre des pharmaciens",
    ],
    answer: 1,
    explain:
      "L'ARP a pris le relais de la Direction de la Pharmacie et du Médicament comme autorité nationale de réglementation pharmaceutique du Sénégal.",
    source: 'Cadre institutionnel ARP, Sénégal',
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
      "Le CTD structure le dossier en 5 modules. L'eCTD n'est pas encore une exigence généralisée dans la région — le papier structuré au format CTD reste la norme.",
    source: "Lignes directrices d'homologation UEMOA",
  },
  {
    domain: "Barèmes · Côte d'Ivoire",
    text: "En Côte d'Ivoire, les redevances d'AMM sont perçues…",
    options: [
      'Par dossier déposé, quel que soit son contenu',
      'Par forme galénique, par dosage et par présentation',
      'Par laboratoire et par an',
      'Uniquement pour les spécialités, les génériques étant exonérés',
    ],
    answer: 1,
    explain:
      'Le décret n° 2015-602 les institue par forme galénique et présentation — et le barème est identique pour les princeps et les génériques. Un produit en 3 dosages × 2 présentations = 6 redevances.',
    source: 'Décret n° 2015-602 du 02/09/2015, art. 3 · modalités AIRP n° 01509 du 22/07/2024',
  },
  {
    domain: "Barèmes · Côte d'Ivoire",
    text: "Toujours à l'AIRP : quel avantage tarifaire une industrie pharmaceutique implantée dans l'espace UEMOA a-t-elle sur la redevance d'AMM (500 000 FCFA) ?",
    options: [
      'Aucun — le barème est identique pour tous',
      'Une remise de 10 %',
      'Moitié prix : 250 000 FCFA',
      'La gratuité totale',
    ],
    answer: 2,
    explain:
      "Les industries de l'espace UEMOA paient moitié prix : 250 000 FCFA au lieu de 500 000. Un vrai levier pour la production régionale — et un détail que beaucoup de dossiers budgétaires oublient.",
    source: "Modalités de demande d'AMM, AIRP n° 01509 du 22/07/2024",
  },
  {
    domain: "Échantillons · Côte d'Ivoire",
    text: "Combien d'échantillons du produit fini (modèle-vente) l'AIRP exige-t-elle au dépôt d'une demande d'AMM ?",
    options: ['5', '10', '30', '50'],
    answer: 2,
    explain:
      "Trente échantillons modèle-vente définitif présentés en français — ou une maquette accompagnée d'une lettre d'engagement à fournir les échantillons. Le vrac n'est pas accepté.",
    source: 'Modalités AIRP n° 01509 du 22/07/2024',
  },
  {
    domain: 'Barèmes · Sénégal',
    text: "Au Sénégal, le décret n° 2025-1833 fixe l'autorisation d'importation d'échantillons à…",
    options: [
      '50 000 FCFA par dossier, validité 1 an',
      '100 000 FCFA par produit, par forme et par dosage, validité 6 mois',
      '250 000 FCFA forfaitaires',
      'Gratuite sur simple déclaration',
    ],
    answer: 1,
    explain:
      "100 000 FCFA par produit, par forme et par dosage, valable 6 mois — l'un des apports du tout nouveau barème des redevances de l'ARP.",
    source: 'Décret n° 2025-1833 du 18/11/2025 (Sénégal)',
  },
  {
    domain: 'Cycle de vie',
    text: "Quelle est la durée de validité classique d'une AMM dans les pays de l'espace UEMOA ?",
    options: ['2 ans', '3 ans', '5 ans, renouvelable', '10 ans, non renouvelable'],
    answer: 2,
    explain:
      "Cinq ans renouvelables — et le renouvellement se prépare des mois à l'avance : redevances, échantillons selon les pays, dossier à jour. C'est l'échéance la plus souvent ratée par les titulaires.",
    source: 'Règlement n° 06/2010/CM/UEMOA et pratiques nationales',
  },
  {
    domain: "Actualité · Côte d'Ivoire",
    text: "Depuis mars 2026, comment l'AIRP reçoit-elle les dépôts de demandes d'AMM ?",
    options: [
      'Dépôt libre au guichet, tous les jours ouvrés',
      'Uniquement par voie électronique',
      "Sur sessions d'enregistrement programmées, sur rendez-vous",
      'Par courrier postal exclusivement',
    ],
    answer: 2,
    explain:
      "La note circulaire n° 0914/AIRP du 24 mars 2026 instaure des sessions programmées (appel à manifestation d'intérêt, plan annuel de réception) avec réception sur rendez-vous, 8 h 30 – 15 h 30. Si vous l'ignoriez, votre prochain dépôt attendra la prochaine session…",
    source: 'Note circulaire n° 0914/AIRP du 24/03/2026',
  },
];

const LEVELS = [
  {
    min: 9,
    cls: 'gold',
    icon: '🏅',
    label: 'Expert régional',
    sub: 'Impressionnant. Vous suivez même les textes publiés il y a quelques mois — vos confrères devraient vous consulter avant chaque dépôt.',
  },
  {
    min: 7,
    cls: 'blue',
    icon: '🎯',
    label: 'Confirmé',
    sub: 'Solide. Il ne vous manque que les toutes dernières évolutions — précisément ce que suit une veille réglementaire continue.',
  },
  {
    min: 4,
    cls: 'blue',
    icon: '📚',
    label: 'En progression',
    sub: 'Les fondamentaux sont là. Les barèmes et textes récents évoluent vite dans la région — le corrigé sourcé va vous être utile.',
  },
  {
    min: 0,
    cls: 'grey',
    icon: '🧭',
    label: 'Explorateur',
    sub: "L'espace UEMOA a ses règles propres, pays par pays. Bonne nouvelle : le corrigé est un excellent point de départ.",
  },
];

let current = 0;
let score = 0;
let answered = false;

const $ = (id) => document.getElementById(id);

function startQuiz() {
  $('screen-intro').classList.add('hidden');
  $('screen-quiz').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  answered = false;
  const q = QUESTIONS[current];
  $('q-counter').textContent = `Question ${current + 1} / ${QUESTIONS.length}`;
  $('q-score').textContent = `Score : ${score}`;
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
  v.textContent = ok ? '✓ Bonne réponse' : '✗ Pas tout à fait';
  v.className = 'verdict ' + (ok ? 'ok' : 'ko');
  $('q-explain-text').textContent = q.explain;
  $('q-source').textContent = q.source;
  $('q-explain').classList.add('show');
  $('q-score').textContent = `Score : ${score}`;
  $('q-next-btn').textContent =
    current === QUESTIONS.length - 1 ? 'Voir mon résultat →' : 'Question suivante →';
  $('q-next-row').classList.add('show');
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
    msg.textContent = 'Adresse e-mail invalide.';
    msg.className = 'form-msg err';
    emailEl.focus();
    return;
  }
  const btn = $('gate-submit');
  btn.disabled = true;
  msg.textContent = 'Envoi en cours…';
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
        website: form.querySelector('.hp').value,
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    form.style.display = 'none';
    $('gate-done').style.display = 'block';
  } catch {
    btn.disabled = false;
    msg.textContent = "L'envoi n'a pas abouti — réessayez dans un instant.";
    msg.className = 'form-msg err';
  }
}

function shareLinkedIn() {
  const url = encodeURIComponent('https://regafy.com/quiz');
  window.open(
    `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    '_blank',
    'noopener'
  );
}

$('start-btn').addEventListener('click', startQuiz);
$('q-next-btn').addEventListener('click', nextQuestion);
$('gate-form').addEventListener('submit', submitGate);
$('share-btn').addEventListener('click', shareLinkedIn);
$('retry-btn').addEventListener('click', () => window.location.reload());
