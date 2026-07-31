/* ── i18n FR/EN (Lot 12) — le toggle de langue swap le contenu POUR DE VRAI (avant : décoratif).
     Mécanisme : chaque élément traduisible porte `data-en` (texte) ; le swap remplace le PREMIER
     nœud texte non vide en PRÉSERVANT les enfants (icônes <svg>) → zéro changement de structure HTML,
     zéro risque de mise en page. Attributs traduisibles : `data-en-al` (aria-label), `data-en-ph`
     (placeholder), `data-en-ti` (title). Le FR d'origine est mémorisé (WeakMap) au 1er passage.
     Persistance `pharnos.lang` (localStorage). Les contenus générés en JS (carte dossier, bouton
     d'envoi) s'abonnent via I18N.on(). ── */
var I18N = (function () {
  // NATIVE = langue rendue EN DUR dans le HTML de CETTE page (prérendu SEO) : `fr` sur `/`,
  // `en` sur `/en/`. La langue ALTERNATIVE vit dans `data-<ALT>` (data-en sur /, data-fr sur /en/).
  // → un crawler sans JS voit la langue native inline ; le toggle swappe vers l'alternative.
  var NATIVE = document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'fr';
  var ALT = NATIVE === 'fr' ? 'en' : 'fr';
  var lang = NATIVE;
  try { var _s = localStorage.getItem('pharnos.lang'); if (_s === 'fr' || _s === 'en') lang = _s; } catch (e) {}
  var orig = new WeakMap();
  var subs = [];

  function remember(el, key, val) {
    var m = orig.get(el);
    if (!m) { m = {}; orig.set(el, m); }
    if (!(key in m)) m[key] = val;
    return m[key];
  }
  /* Remplace le 1er nœud texte non vide, garde les éléments enfants (icônes). */
  function setText(el, str) {
    var done = false;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        if (!done) { n.nodeValue = str; done = true; } else { n.nodeValue = ''; }
      }
    }
    if (!done) el.appendChild(document.createTextNode(str));
  }
  function firstText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.trim()) return n.nodeValue;
    }
    return '';
  }
  /* Garde-fou : `setText` ne mémorise/restaure QUE le 1er nœud texte. Un `data-en` posé sur un
     élément qui a du texte AVANT ET APRÈS un enfant perdrait silencieusement le FR de fin au retour.
     On alerte (une fois) → envelopper le texte dans un <span data-en> (cf. compteur & message d'erreur). */
  var warned = new WeakSet();
  function guard(el) {
    if (warned.has(el)) return;
    var c = 0;
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim()) c++;
    }
    if (c > 1) {
      warned.add(el);
      try {
        console.warn(
          '[i18n] « data-en » sur un élément à plusieurs nœuds texte — le FR situé après un enfant ' +
            'sera perdu au retour FR. Enveloppez le texte dans un <span data-en>.',
          el,
        );
      } catch (e) {}
    }
  }
  var ATTRS = { al: 'aria-label', ph: 'placeholder', ti: 'title', lb: 'label' };

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-' + ALT + ']').forEach(function (el) {
      guard(el);
      var nativeText = remember(el, 't', firstText(el));
      setText(el, lang === NATIVE ? nativeText : el.getAttribute('data-' + ALT));
    });
    Object.keys(ATTRS).forEach(function (k) {
      var attr = ATTRS[k];
      document.querySelectorAll('[data-' + ALT + '-' + k + ']').forEach(function (el) {
        var nativeVal = remember(el, attr, el.getAttribute(attr) || '');
        el.setAttribute(attr, lang === NATIVE ? nativeVal : el.getAttribute('data-' + ALT + '-' + k));
      });
    });
    subs.forEach(function (fn) { try { fn(lang); } catch (e) {} });
  }
  function set(l) {
    lang = l === 'en' ? 'en' : 'fr';
    try { localStorage.setItem('pharnos.lang', lang); } catch (e) {}
    apply();
    // Aligne l'URL sur la langue SANS recharger : chaque langue a son URL canonique prérendue
    // (`/` ↔ `/en/`, `/checking-standard` ↔ `/en/checking-standard`). Au reload, la bonne page
    // statique se sert d'elle-même. Le miroir se DÉDUIT du chemin courant — hardcoder « / » ici
    // renverrait le visiteur d'une page interne à l'accueil au premier changement de langue.
    try {
      // ⚠️ Certaines pages changent de SLUG d'une langue à l'autre : préfixer « /en » y fabrique
      // une URL qui n'existe pas. La page continuerait de s'afficher (replaceState ne recharge
      // rien), mais tout rechargement, partage ou retour arrière tomberait en 404.
      // Toute entrée ici DOIT exister dans PAGES de web/scripts/build-landing-en.mjs : ce build
      // vérifie la réciproque et échoue si un slug divergent manque à cette table.
      var MIROIR = {
        '/bibliotheque-reglementaire': '/en/regulatory-library',
        '/modele': '/en/template',
      };
      var VERS_FR = {};
      for (var k in MIROIR) VERS_FR[MIROIR[k]] = k;

      // L'extension est conservée telle quelle : en production les URL sont « propres », mais un
      // serveur statique local sert « /page.html » — la retirer y casserait le rechargement.
      var ext = /\.html$/.test(location.pathname) ? '.html' : '';
      var p = location.pathname.replace(/\.html$/, '');
      var want;
      if (lang === 'en') {
        want = MIROIR[p] || (/^\/en(\/|$)/.test(p) ? p : '/en' + (p === '/' ? '/' : p));
      } else {
        want = VERS_FR[p] || p.replace(/^\/en(?=\/|$)/, '') || '/';
      }
      want += want === '/' || /\/$/.test(want) ? '' : ext;
      // search + hash conservés : sur /modele?doc=rcp, les perdre ferait retomber la page
      // sur son document par défaut au premier changement de langue.
      if (location.pathname !== want)
        history.replaceState(null, '', want + location.search + location.hash);
    } catch (e) {}
  }
  /* Boutons FR/EN (header + menu mobile) : pilotent le vrai swap + l'état visuel. */
  document.querySelectorAll('.lang').forEach(function (grp) {
    grp.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      set(b.textContent.trim().toLowerCase() === 'en' ? 'en' : 'fr');
    });
  });
  subs.push(function (l) {
    document.querySelectorAll('.lang button').forEach(function (b) {
      var on = b.textContent.trim().toLowerCase() === l;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  apply();
  return { get: function () { return lang; }, on: function (fn) { subs.push(fn); apply(); }, set: set };
})();

/* ── Menu « Outils » du header (patron disclosure : bouton + aria-expanded).
     Ce sont des liens de navigation, pas des commandes : on garde la sémantique native plutôt
     qu'un menu ARIA, plus fragile et sans bénéfice ici. Le menu se ferme au clic extérieur, à
     Échap (focus rendu au déclencheur) et au départ du focus — sinon il reste ouvert derrière
     le contenu quand on tabule au clavier. ── */
(function () {
  var trigger = document.getElementById('tools-trigger');
  var menu = document.getElementById('tools-menu');
  if (!trigger || !menu) return; /* pages sans menu Outils */

  function setOpen(open) {
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }
  var isOpen = function () { return trigger.getAttribute('aria-expanded') === 'true'; };

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!isOpen());
  });
  document.addEventListener('click', function (e) {
    if (isOpen() && !menu.contains(e.target) && e.target !== trigger) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) { setOpen(false); trigger.focus(); }
  });
  document.addEventListener('focusin', function (e) {
    if (isOpen() && !menu.contains(e.target) && e.target !== trigger) setOpen(false);
  });
  /* Flèche bas depuis le déclencheur : ouvre et pose le focus sur la première entrée. */
  trigger.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown') return;
    e.preventDefault();
    setOpen(true);
    var first = menu.querySelector('a');
    if (first) first.focus();
  });
})();

/* ── Modale « Demander une démo » — POST JSON vers l'Edge Supabase `demo-request`.
     IIFE séparée : la scène de la constellation fait un early-return si le SVG manque. ── */
(function () {
  var dlg = document.getElementById('demo-dialog');
  if (!dlg) return;
  var form = document.getElementById('demo-form');
  var submit = document.getElementById('demo-submit');
  var errBox = document.getElementById('demo-error');
  var API = 'https://uhsireqwzqqymgsxuvqh.supabase.co/functions/v1/demo-request';
  var FALLBACK = 'mailto:contact@pharnos.com?subject=' + encodeURIComponent('Démo Pharnos');
  var canModal = typeof dlg.showModal === 'function';

  document.querySelectorAll('[data-demo-open]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!canModal) { window.location.href = FALLBACK; return; } /* très vieux navigateurs */
      dlg.classList.remove('done');
      errBox.hidden = true;
      dlg.showModal();
      form.querySelector('input[name="fullName"]').focus();
    });
  });

  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.closest('[data-demo-close]')) dlg.close();
  });

  /* « Autre (à préciser) » : la MÊME case bascule en saisie libre. Le select garde la valeur
     'Autre' (caché mais valide) ; le bouton × vide et ramène la liste. */
  function swapField(sel) {
    var wrap = sel.parentElement.querySelector('.demo-swap');
    var input = wrap.querySelector('input');
    sel.addEventListener('change', function () {
      if (sel.value !== 'Autre') return;
      sel.hidden = true;
      wrap.hidden = false;
      input.required = true;
      input.focus();
    });
    function reset(refocus) {
      wrap.hidden = true;
      input.required = false;
      input.value = '';
      sel.hidden = false;
      if (refocus) { sel.value = ''; sel.focus(); }
    }
    wrap.querySelector('.demo-swap-back').addEventListener('click', function () { reset(true); });
    return reset;
  }
  var resetOrgSwap = swapField(document.getElementById('demo-orgtype'));
  var resetJobSwap = swapField(document.getElementById('demo-jobtitle'));

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var fd = new FormData(form);
    submit.disabled = true;
    submit.textContent = I18N.get() === 'en' ? 'Sending…' : 'Envoi…';
    errBox.hidden = true;
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: fd.get('fullName'),
        email: fd.get('email'),
        orgType: fd.get('orgType'),
        orgTypeOther: fd.get('orgTypeOther'),
        company: fd.get('company'),
        /* poste « Autre » : la saisie libre EST le poste (le serveur accepte du texte libre) */
        jobTitle: fd.get('jobTitle') === 'Autre' && fd.get('jobTitleOther') ? fd.get('jobTitleOther') : fd.get('jobTitle'),
        country: fd.get('country'),
        website: fd.get('website')
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('http_' + res.status);
      return res.json();
    }).then(function () {
      dlg.classList.add('done');
      form.reset();
      resetOrgSwap(false); /* reset() ne déclenche pas `change` : re-afficher les listes */
      resetJobSwap(false);
      dlg.querySelector('.demo-success [data-demo-close]').focus();
    }).catch(function () {
      errBox.hidden = false;
    }).finally(function () {
      submit.disabled = false;
      submit.textContent = I18N.get() === 'en' ? 'Send request' : 'Envoyer la demande';
    });
  });
})();

(function () {
    var MOTION = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Header fondu tant que la couverture est à l'écran */
    var header = document.querySelector('.site-header');
    var hero = document.querySelector('.hero');
    if (header && hero) {
      header.classList.add('on-cover');
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (e) {
          header.classList.toggle('on-cover', e[0].isIntersecting);
        }, { rootMargin: '-72px 0px 0px 0px', threshold: 0 }).observe(hero);
      }
    }

    /* Sélecteur de langue : géré par le module I18N en tête de fichier (vrai swap FR/EN). */

    /* Menu mobile */
    var burger = document.querySelector('.burger');
    var mnav = document.getElementById('mnav');
    if (burger && mnav) {
      burger.addEventListener('click', function () {
        var open = mnav.hasAttribute('hidden');
        if (open) { mnav.removeAttribute('hidden'); } else { mnav.setAttribute('hidden', ''); }
        burger.setAttribute('aria-expanded', String(open));
      });
      mnav.addEventListener('click', function (e) {
        if (e.target.closest('a')) { mnav.setAttribute('hidden', ''); burger.setAttribute('aria-expanded', 'false'); }
      });
    }

    /* Révélation au scroll — une seule fois, discrète. */
    var targets = document.querySelectorAll('.reveal');
    if (!MOTION || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.18 });
      targets.forEach(function (el) { io.observe(el); });
    }

    /* ── Scène : naissance de la marque → réseau UEMOA → embrasement du continent. ── */
    var STEPS = [
      { n: 'BJ', dci: 'Amoxicilline 500 mg',        step: 5, stage: 'Soumission',    stageEn: 'Submission',    status: 'J+38 · frais en attente — relance J+14 armée',      statusEn: 'D+38 · fees pending — D+14 reminder armed' },
      { n: 'TG', dci: 'Paracétamol 500 mg',          step: 3, stage: 'Décision',      stageEn: 'Decision',      status: 'validation du correspondant en cours',             statusEn: 'correspondent validation in progress' },
      { n: 'CI', dci: 'Amodiaquine 200 mg',          step: 6, stage: 'Notifications', stageEn: 'Notifications',  status: 'J+112 · échéance GMP dans 24 j',                   statusEn: 'D+112 · GMP deadline in 24 d' },
      { n: 'GH', dci: 'Azithromycine 250 mg',        step: 4, stage: 'Dépôt',         stageEn: 'Filing',        status: 'récépissé joint hier — conforme',                  statusEn: 'receipt attached yesterday — compliant' },
      { n: 'BF', dci: 'Metformine 850 mg',           step: 2, stage: 'Revue',         stageEn: 'Review',        status: 'pièces reçues — revue sous 5 j',                   statusEn: 'documents received — review within 5 d' },
      { n: 'ML', dci: 'Artéméther/Lumé. 80/480 mg',  step: 5, stage: 'Soumission',    stageEn: 'Submission',    status: 'échantillons livrés · LTA 057-4412',              statusEn: 'samples delivered · AWB 057-4412' },
      { n: 'SN', dci: 'Oméprazole 20 mg',            step: 7, stage: 'AMM',           stageEn: 'MA',            status: 'délivrée · 5 ans — renouvellement J−6 mois',       statusEn: 'granted · 5 years — renewal at M−6' },
      { n: 'GW', dci: 'Ceftriaxone 1 g',             step: 1, stage: 'Montage',       stageEn: 'Assembly',      status: 'CTD à 82 % — compilation demain',                  statusEn: 'CTD at 82% — compile tomorrow' },
      { n: 'NE', dci: 'Ibuprofène 400 mg',           step: 4, stage: 'Dépôt',         stageEn: 'Filing',        status: 'dépôt confirmé ce matin',                          statusEn: 'filing confirmed this morning' },
      { n: 'NG', dci: 'Quinine 300 mg',              step: 2, stage: 'Revue',         stageEn: 'Review',        status: 'traduction EN vérifiée par Regafy',                statusEn: 'EN translation checked by Regafy' }
    ];
    /* atomes du reste du continent (id, x, y) — émaillés par vague radiale depuis l'UEMOA */
    var REST = [
      ['m-GM',72,198],['m-GN',114,230],['m-SL',102,250],['m-LR',120,266],['m-MR',108,140],['m-CV',34,168],
      ['r-MA',150,64],['r-DZ',232,84],['r-TN',294,40],['r-LY',340,92],['r-EG',408,84],
      ['r-SD',400,152],['r-TD',318,168],['r-ER',450,160],['r-DJ',486,190],['r-ET',452,204],
      ['r-SO',508,224],['r-SS',408,208],['r-CM',252,258],['r-CF',340,232],['r-GQ',250,282],
      ['r-GA',258,300],['r-CG',288,300],['r-CD',340,292],['r-UG',408,262],['r-KE',446,262],
      ['r-RW',392,288],['r-BI',394,302],['r-TZ',420,318],['r-AO',300,352],['r-ZM',352,352],
      ['r-MW',400,340],['r-MZ',408,392],['r-ZW',360,392],['r-BW',330,424],['r-NA',296,412],
      ['r-ZA',336,478],['r-LS',352,478],['r-SZ',378,452],['r-MG',481,420]
    ];
    var COVERED = [[214,238],[200,248],[148,250],[180,256],[174,214],[150,168],[84,184],[90,206],[230,178],[244,228]];
    var HEART = [176,220];
    REST.sort(function (a, b) {
      var da = (a[1]-HEART[0])*(a[1]-HEART[0]) + (a[2]-HEART[1])*(a[2]-HEART[1]);
      var db = (b[1]-HEART[0])*(b[1]-HEART[0]) + (b[2]-HEART[1])*(b[2]-HEART[1]);
      return da - db;
    });

    var svg = document.getElementById('map');
    if (!svg) return;
    var links = svg.querySelectorAll('.link');
    var dyn = document.getElementById('dyn');
    var cov = document.getElementById('cov');
    var covx = document.getElementById('covx');
    var card = document.getElementById('dcard');
    var segs = document.getElementById('d-segs').children;
    var cadu = document.getElementById('cadu');
    var morph = document.getElementById('morphwrap');
    var manims = morph.querySelectorAll('animate');
    var logoP = document.getElementById('logoP');
    var wordmark = document.getElementById('wordmark');
    var africaEls = svg.querySelectorAll('.africa');

    var curStep = STEPS[0];
    function fillCard(d) {
      curStep = d;
      var en = I18N.get() === 'en';
      document.getElementById('d-dci').textContent = d.dci;
      document.getElementById('d-cc').textContent = d.n;
      document.getElementById('d-stage').textContent = en ? d.stageEn : d.stage;
      document.getElementById('d-status').textContent = en ? d.statusEn : d.status;
      for (var k = 0; k < 7; k++) segs[k].className = k < d.step - 1 ? 'done' : (k === d.step - 1 ? 'now' : '');
    }
    fillCard(STEPS[0]);
    /* Re-render la carte dans la nouvelle langue au changement (le DCI = molécule, inchangé). */
    I18N.on(function () { fillCard(curStep); });

    function nearest(p, pts) {
      var best = pts[0], bd = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0]-p[0], dy = pts[i][1]-p[1], d = dx*dx + dy*dy;
        if (d < bd) { bd = d; best = pts[i]; }
      }
      return best;
    }
    function link2(from, to) {
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', from[0]); ln.setAttribute('y1', from[1]);
      ln.setAttribute('x2', to[0]);   ln.setAttribute('y2', to[1]);
      ln.setAttribute('pathLength', '1'); ln.setAttribute('class', 'dlink');
      dyn.appendChild(ln);
      return ln;
    }

    if (!MOTION) { /* statique : scène finale complète, réseau tissé d'un coup */
      cov.textContent = '10';
      var act = COVERED.slice();
      REST.forEach(function (r) { var p = [r[1], r[2]]; link2(nearest(p, act), p); act.push(p); });
      return;
    }

    /* pause hors-écran — l'animation démarre quand la section entre à l'écran
       (onglet caché : Chrome throttle déjà les timers, pas besoin de verrou supplémentaire) */
    var inView = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { inView = e[0].isIntersecting; }, { threshold: 0.2 })
        .observe(svg);
    } else { inView = true; }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function gate() {
      return new Promise(function (r) {
        (function check() { inView ? r() : setTimeout(check, 350); })();
      });
    }
    function swapCard(d) {
      card.classList.add('swap');
      setTimeout(function () { fillCard(d); card.classList.remove('swap'); }, 200);
    }

    (async function run() {
      for (;;) {
        await gate();
        /* 1 · naissance de la marque : le logo pharmacie devient Pharnos */
        cadu.classList.add('show');
        await sleep(1150);
        cadu.classList.add('out');
        morph.classList.add('show');
        await sleep(420);
        morph.classList.add('toP');
        manims.forEach(function (a) { a.beginElement(); });
        await sleep(1000);
        logoP.classList.add('on');
        morph.classList.add('out');
        await sleep(380);
        wordmark.classList.add('on');
        await sleep(800);
        /* 2 · le réseau UEMOA + Ghana, Nigeria — atome par atome */
        for (var i = 0; i < STEPS.length; i++) {
          await gate();
          if (i > 0) { links[i - 1].classList.add('on'); await sleep(300); }
          document.getElementById('n-' + STEPS[i].n).classList.add('on');
          cov.textContent = String(i + 1);
          swapCard(STEPS[i]);
          await sleep(i === 0 ? 1200 : 1400);
        }
        await gate();
        links[9].classList.add('on'); await sleep(380);
        links[10].classList.add('on');
        await sleep(1000);
        /* 3 · le gabarit du continent apparaît, l'émaillage s'embrase depuis l'UEMOA */
        africaEls.forEach(function (el) { el.classList.add('on'); });
        covx.classList.add('on');
        await sleep(1600);
        var active = COVERED.slice();
        for (var j = 0; j < REST.length; j++) {
          var r = REST[j], p = [r[1], r[2]];
          var ln = link2(nearest(p, active), p);
          void ln.getBoundingClientRect(); /* fixe l'état initial avant la transition */
          ln.classList.add('on');
          document.getElementById(r[0]).classList.add('on');
          active.push(p);
          await sleep(85);
        }
        /* 4 · l'Afrique émaillée, Pharnos à sa place — contemplation */
        await sleep(6200);
        /* 5 · fondu, remise à zéro, on rejoue */
        svg.classList.add('fade');
        await sleep(560);
        svg.querySelectorAll('.on').forEach(function (el) { el.classList.remove('on'); });
        morph.classList.remove('show', 'toP', 'out');
        cadu.classList.remove('show', 'out');
        covx.classList.remove('on');
        dyn.innerHTML = '';
        cov.textContent = '0';
        await sleep(80);
        svg.classList.remove('fade');
        await sleep(450);
      }
    })();
  })();
