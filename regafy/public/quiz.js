/* Regafy — The UEMOA RA Test v4 « Chaleur & Or » (CSP script-src 'self': no inline).
   - i18n : EN par défaut, FR si navigateur fr (?lang=fr|en pour forcer)
   - Tirage : 10 familles au hasard dans BANK (public/bank.js), 1 variante par famille
   - Timer : 30 s/question, bips ≤ 10 s (Web Audio), timeout = ratée + auto-avance sans retour
   - Gamification : séries 🔥, points, pastilles de progression, confettis (score ≥ 8),
     barre d'action FIXE (bouton suivant toujours visible — CSS .next-row)
   - Chrono total + classement D1 (/api/score) : rang mondial + rang pays (score puis temps) */

'use strict';

const LANG = (() => {
  const p = new URLSearchParams(location.search).get('lang');
  if (p === 'fr' || p === 'en') return p;
  return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
})();

const QUESTION_MS = 30000;
const TIMEOUT_PAUSE_MS = 2600;
const CONFETTI_MIN_SCORE = 8;

const UI_FR = {
  title: 'Le Test RA UEMOA — êtes-vous incollable ? · Regafy',
  kicker: 'Quiz · Affaires réglementaires',
  h1: 'Êtes-vous incollable sur la réglementation pharmaceutique UEMOA&nbsp;?',
  lead: '10 questions tirées au sort, 30 secondes chacune — langue de soumission, échantillons, variations, renouvellements. <em>Chaque réponse est expliquée et sourcée.</em> Enchaînez les bonnes réponses pour allumer votre série 🔥',
  chip1: '📋 10 questions',
  chip2: '⏱️ 30 s par question',
  chip3: '🏆 Classement mondial & pays',
  start: 'Commencer le test',
  fineprint: "Gratuit, sans inscription. Votre score s'affiche immédiatement — l'e-mail n'est demandé que si vous voulez recevoir le corrigé.",
  gateTitle: 'Recevez votre corrigé détaillé',
  gatePitch: 'Les 10 réponses de VOTRE tirage, expliquées avec <strong>leurs références</strong>.',
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
  bTitle: 'Entrez au classement',
  bSub: 'Score puis chrono décident de votre rang — mondial et dans votre pays.',
  bPh: 'Votre prénom ou pseudo',
  bBtn: 'Voir mon rang',
  counter: (i, n) => `Question ${i} / ${n}`,
  pts: (s) => `${s * 10} pts`,
  ok: '✓ Bonne réponse',
  okStreak: (n) => `✓ Bonne réponse — série de ${n} ! 🔥`,
  ko: '✗ Pas tout à fait',
  timeout: '⏱️ Temps écoulé !',
  next: 'Question suivante →',
  seeResult: 'Voir mon résultat ✨',
  time: (m, s) => `⏱️ Temps : ${m} min ${String(s).padStart(2, '0')} s`,
  rankGlobal: (r, t) => `🌍 nº ${r} sur ${t} au classement général`,
  rankCountry: (r, t, name) => ` nº ${r} sur ${t} — ${name}`,
  top10: '🏆 Top 10 !',
  nameErr: 'Un prénom ou pseudo de 2 à 24 caractères, s’il vous plaît.',
  invalidEmail: 'Adresse e-mail invalide.',
  sending: 'Envoi en cours…',
  sendFail: "L'envoi n'a pas abouti — réessayez dans un instant.",
};

const UI_EN = {
  counter: (i, n) => `Question ${i} / ${n}`,
  pts: (s) => `${s * 10} pts`,
  ok: '✓ Correct',
  okStreak: (n) => `✓ Correct — streak of ${n}! 🔥`,
  ko: '✗ Not quite',
  timeout: "⏱️ Time's up!",
  next: 'Next question →',
  seeResult: 'See my result ✨',
  time: (m, s) => `⏱️ Time: ${m} min ${String(s).padStart(2, '0')} s`,
  rankGlobal: (r, t) => `🌍 #${r} of ${t} worldwide`,
  rankCountry: (r, t, name) => ` #${r} of ${t} — ${name}`,
  top10: '🏆 Top 10!',
  nameErr: 'A first name or alias, 2 to 24 characters, please.',
  invalidEmail: 'Invalid email address.',
  sending: 'Sending…',
  sendFail: "That didn't go through — please try again in a moment.",
};

const T = LANG === 'fr' ? UI_FR : UI_EN;

/* ── Tirage : 10 familles au hasard, 1 variante par famille ── */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const RUN = (() => {
  const byFam = new Map();
  for (const q of BANK) {
    if (!byFam.has(q.family)) byFam.set(q.family, []);
    byFam.get(q.family).push(q);
  }
  const fams = shuffle([...byFam.keys()]).slice(0, 10);
  return fams.map((f) => {
    const variants = byFam.get(f);
    return variants[Math.floor(Math.random() * variants.length)];
  });
})();

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
let streak = 0;
let answered = false;
let totalMs = 0;
let qStart = 0;
let timerId = null;
let lastBeepSec = null;
let boardSent = false;

const $ = (id) => document.getElementById(id);

/* ── Sons (Web Audio, généré — CSP sans fichiers) ── */
let audioCtx = null;
function initAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    audioCtx = null;
  }
}
function beep(freq, ms, gain) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + ms / 1000);
  } catch {
    /* silencieux */
  }
}
const tickBeep = (sec) => beep(sec <= 3 ? 1100 : 880, 70, 0.045);
function timeoutSound() {
  beep(440, 170, 0.06);
  setTimeout(() => beep(220, 240, 0.06), 170);
}

/* ── i18n du chrome statique (HTML livré en anglais) ── */
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
  set('b-title', UI_FR.bTitle);
  set('b-sub', UI_FR.bSub);
  set('board-btn', UI_FR.bBtn);
  const email = $('email');
  if (email) email.placeholder = UI_FR.emailPh;
  const pname = $('player-name');
  if (pname) pname.placeholder = UI_FR.bPh;
}

function startQuiz() {
  initAudio();
  $('screen-intro').classList.add('hidden');
  $('screen-quiz').classList.remove('hidden');
  $('streak').classList.remove('hidden');
  $('byline').classList.add('hidden');
  renderQuestion();
}

function startTimer() {
  qStart = performance.now();
  lastBeepSec = null;
  const disp = $('q-timer');
  disp.classList.remove('warn');
  disp.textContent = '30';
  timerId = setInterval(() => {
    const left = QUESTION_MS - (performance.now() - qStart);
    const sec = Math.max(0, Math.ceil(left / 1000));
    disp.textContent = String(sec);
    if (sec <= 10) {
      disp.classList.add('warn');
      if (sec !== lastBeepSec && sec > 0) {
        lastBeepSec = sec;
        tickBeep(sec);
      }
    }
    if (left <= 0) {
      stopTimer();
      onTimeout();
    }
  }, 200);
}
function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function renderDots() {
  const d = $('q-dots');
  d.textContent = '';
  for (let i = 0; i < RUN.length; i++) {
    const s = document.createElement('span');
    s.className = 'dot' + (i < current ? ' done' : i === current ? ' now' : '');
    d.appendChild(s);
  }
}

function bumpStreak() {
  $('streak-n').textContent = String(streak);
  const st = $('streak');
  st.classList.remove('pop');
  void st.offsetWidth;
  st.classList.add('pop');
}

function renderQuestion() {
  answered = false;
  const q = RUN[current][LANG];
  $('q-counter').textContent = T.counter(current + 1, RUN.length);
  $('q-score').textContent = T.pts(score);
  renderDots();
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
  startTimer();
}

function revealAnswer(pickedIndex, verdictText, verdictCls) {
  const item = RUN[current];
  const q = item[LANG];
  document.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === item.answer) b.classList.add('correct');
    else if (j === pickedIndex) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  const v = $('q-verdict');
  v.textContent = verdictText;
  v.className = 'verdict ' + verdictCls;
  $('q-explain-text').textContent = q.explain;
  $('q-source').textContent = q.source;
  $('q-explain').classList.add('show');
  $('q-score').textContent = T.pts(score);
}

function answer(i) {
  if (answered) return;
  answered = true;
  stopTimer();
  totalMs += performance.now() - qStart;
  const item = RUN[current];
  const ok = i === item.answer;
  if (ok) {
    score++;
    streak++;
  } else {
    streak = 0;
  }
  bumpStreak();
  revealAnswer(i, ok ? (streak >= 3 ? T.okStreak(streak) : T.ok) : T.ko, ok ? 'ok' : 'ko');
  $('q-next-btn').textContent = current === RUN.length - 1 ? T.seeResult : T.next;
  // Barre d'action FIXE en bas d'écran : toujours visible, zéro scroll
  $('q-next-row').classList.add('show');
}

/* Timeout : question ratée, réponse révélée, passage AUTOMATIQUE sans retour */
function onTimeout() {
  if (answered) return;
  answered = true;
  totalMs += QUESTION_MS;
  streak = 0;
  bumpStreak();
  timeoutSound();
  revealAnswer(-1, T.timeout, 'ko');
  setTimeout(nextQuestion, TIMEOUT_PAUSE_MS);
}

function nextQuestion() {
  current++;
  if (current < RUN.length) {
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    showResult();
  }
}

function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return T.time(Math.floor(s / 60), s % 60);
}

/* Confettis de félicitations (score ≥ 8) */
function confetti() {
  const colors = ['#8b5cf6', '#e3b341', '#059669', '#6d28d9', '#f59e0b'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('span');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 2.2 + Math.random() * 2 + 's';
    c.style.animationDelay = Math.random() * 0.8 + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5200);
  }
}

function showResult() {
  stopTimer();
  $('screen-quiz').classList.add('hidden');
  $('q-next-row').classList.remove('show');
  $('screen-result').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const lvl = LEVELS.find((l) => score >= l.min);
  const badge = $('r-badge');
  badge.className = 'level-badge ' + lvl.cls;
  badge.textContent = `${lvl.icon} ${lvl.label}`;
  $('r-sub').textContent = lvl.sub;
  $('r-time').textContent = fmtTime(totalMs);
  let n = 0;
  const numEl = $('r-num');
  const t = setInterval(() => {
    numEl.textContent = n;
    if (n >= score) clearInterval(t);
    n++;
  }, 90);
  setTimeout(() => {
    $('ring').style.strokeDashoffset = String(402 - (402 * score) / 10);
  }, 60);
  if (score >= CONFETTI_MIN_SCORE) confetti();
}

/* ── Classement ── */
function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
function countryName(code) {
  try {
    return new Intl.DisplayNames([LANG], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

async function submitBoard() {
  if (boardSent) return;
  const nameEl = $('player-name');
  const msg = $('b-msg');
  const name = nameEl.value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24) {
    msg.textContent = T.nameErr;
    msg.className = 'form-msg err';
    nameEl.focus();
    return;
  }
  const btn = $('board-btn');
  btn.disabled = true;
  msg.textContent = T.sending;
  msg.className = 'form-msg';
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, time_ms: Math.round(totalMs), lang: LANG, website: '' }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    boardSent = true;
    msg.textContent = '';
    $('board-form').classList.add('hidden');
    const ranks = $('ranks');
    ranks.classList.remove('hidden');
    ranks.textContent = '';
    const g = document.createElement('p');
    g.className = 'rank-line';
    g.textContent = T.rankGlobal(data.global.rank, data.global.total);
    ranks.appendChild(g);
    if (data.country && data.country.code && data.country.code !== 'XX') {
      const c = document.createElement('p');
      c.className = 'rank-line';
      c.textContent =
        flagEmoji(data.country.code) +
        T.rankCountry(data.country.rank, data.country.total, countryName(data.country.code));
      ranks.appendChild(c);
    }
    if (data.global.rank <= 10) {
      const top = document.createElement('p');
      top.className = 'rank-top';
      top.textContent = T.top10;
      ranks.appendChild(top);
    }
  } catch {
    btn.disabled = false;
    msg.textContent = T.sendFail;
    msg.className = 'form-msg err';
  }
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
        ids: RUN.map((q) => q.id),
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
$('board-btn').addEventListener('click', submitBoard);
$('gate-form').addEventListener('submit', submitGate);
$('share-btn').addEventListener('click', shareLinkedIn);
$('retry-btn').addEventListener('click', () => window.location.reload());
