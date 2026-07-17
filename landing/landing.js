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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var fd = new FormData(form);
    submit.disabled = true;
    submit.textContent = 'Envoi…';
    errBox.hidden = true;
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName: fd.get('fullName'),
        email: fd.get('email'),
        company: fd.get('company'),
        jobTitle: fd.get('jobTitle'),
        country: fd.get('country'),
        website: fd.get('website')
      })
    }).then(function (res) {
      if (!res.ok) throw new Error('http_' + res.status);
      return res.json();
    }).then(function () {
      dlg.classList.add('done');
      form.reset();
      dlg.querySelector('.demo-success [data-demo-close]').focus();
    }).catch(function () {
      errBox.hidden = false;
    }).finally(function () {
      submit.disabled = false;
      submit.textContent = 'Envoyer la demande';
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

    /* Sélecteur de langue (état visuel ; traduction du contenu = jalon i18n) */
    document.querySelectorAll('.lang').forEach(function (grp) {
      grp.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        grp.querySelectorAll('button').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
      });
    });

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
      { n: 'BJ', dci: 'Amoxicilline 500 mg',        step: 5, stage: 'Soumission',    status: 'J+38 · frais en attente — relance J+14 armée' },
      { n: 'TG', dci: 'Paracétamol 500 mg',          step: 3, stage: 'Décision',      status: 'validation du correspondant en cours' },
      { n: 'CI', dci: 'Amodiaquine 200 mg',          step: 6, stage: 'Notifications', status: 'J+112 · échéance GMP dans 24 j' },
      { n: 'GH', dci: 'Azithromycine 250 mg',        step: 4, stage: 'Dépôt',         status: 'récépissé joint hier — conforme' },
      { n: 'BF', dci: 'Metformine 850 mg',           step: 2, stage: 'Revue',         status: 'pièces reçues — revue sous 5 j' },
      { n: 'ML', dci: 'Artéméther/Lumé. 80/480 mg',  step: 5, stage: 'Soumission',    status: 'échantillons livrés · LTA 057-4412' },
      { n: 'SN', dci: 'Oméprazole 20 mg',            step: 7, stage: 'AMM',           status: 'délivrée · 5 ans — renouvellement J−6 mois' },
      { n: 'GW', dci: 'Ceftriaxone 1 g',             step: 1, stage: 'Montage',       status: 'CTD à 82 % — compilation demain' },
      { n: 'NE', dci: 'Ibuprofène 400 mg',           step: 4, stage: 'Dépôt',         status: 'dépôt confirmé ce matin' },
      { n: 'NG', dci: 'Quinine 300 mg',              step: 2, stage: 'Revue',         status: 'traduction EN vérifiée par Regafy' }
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

    function fillCard(d) {
      document.getElementById('d-dci').textContent = d.dci;
      document.getElementById('d-cc').textContent = d.n;
      document.getElementById('d-stage').textContent = d.stage;
      document.getElementById('d-status').textContent = d.status;
      for (var k = 0; k < 7; k++) segs[k].className = k < d.step - 1 ? 'done' : (k === d.step - 1 ? 'now' : '');
    }
    fillCard(STEPS[0]);

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
