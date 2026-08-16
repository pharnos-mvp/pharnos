/* ── Consentement aux traceurs — pharnos.com ────────────────────────────────────────────────
 *
 * CE QUE DIT LE DROIT, et pourquoi ce module se tait aujourd'hui.
 *
 * L'article 82 de la loi Informatique et Libertés (transposition de la directive ePrivacy)
 * soumet à consentement toute écriture ou lecture dans le terminal — SAUF ce qui est
 * strictement nécessaire au service demandé. La CNIL range explicitement la PRÉFÉRENCE DE
 * LANGUE et l'enregistrement du choix en matière de traceurs parmi les exemptions.
 *
 * Or ce site ne pose rien d'autre : pas de mesure d'audience, pas de régie, pas de bouton
 * social — et sa CSP (`script-src 'self'`) interdit matériellement d'en charger un. La
 * conclusion n'est pas de moi : **il n'y a aujourd'hui aucun consentement à demander**.
 *
 * ⚠️ D'où la règle de ce fichier : LE BANDEAU NE S'AFFICHE QUE SI `TRACEURS` N'EST PAS VIDE.
 * Afficher un bandeau quand rien ne le justifie n'est pas « prudent », c'est un défaut : on
 * demande à l'utilisateur un consentement sans objet, on l'habitue à cliquer sans lire, et on
 * fabrique une preuve de consentement qui ne porte sur rien. La CNIL et le CEPD sanctionnent
 * les interfaces trompeuses, pas seulement les traceurs non consentis.
 *
 * CE QUE FAIT CE MODULE, alors, s'il ne s'affiche pas ? Il pose la SERRURE. Le jour où une
 * balise arrive, elle passe par `surAccord()` et ne peut pas se charger avant le clic. C'est
 * l'inverse du réflexe habituel — poser la balise, puis coller un bandeau par-dessus — qui est
 * précisément ce qui se fait sanctionner.
 *
 * POUR ACTIVER : déclarer la balise dans `TRACEURS` ci-dessous, et charger son script depuis
 * `PharnosConsent.surAccord('mesure', …)`. Le bandeau apparaît alors tout seul. Ne jamais
 * charger un tiers en dehors de cette porte.
 *
 * RÈGLES DE FORME appliquées (recommandation CNIL du 17/09/2020, délibération 2020-092) :
 *   • « Tout refuser » au PREMIER niveau, même poids visuel que « Tout accepter » ;
 *   • aucune case pré-cochée, le refus est l'état par défaut ;
 *   • retrait aussi simple que l'accord — lien permanent dans le pied de page ;
 *   • choix conservé 6 mois, accord comme refus, puis re-sollicitation ;
 *   • preuve conservée : date, version des catégories, choix par finalité.
 *
 * La preuve reste DANS LE NAVIGATEUR. La journaliser sur nos serveurs supposerait d'identifier
 * un visiteur qui, justement, vient de refuser d'être suivi.
 * ── */
var PharnosConsent = (function () {
  var CLE = 'pharnos.consent';
  /* Bumper cette version re-sollicite tout le monde : à faire dès qu'une finalité change. */
  var VERSION = 1;
  var DUREE_MS = 182 * 24 * 60 * 60 * 1000; // ~6 mois (recommandation CNIL)

  /* ── Les traceurs NON ESSENTIELS réellement posés par ce site. Vide = rien à consentir. ──
     Forme attendue : { id: 'ga4', cat: 'mesure', nom: 'Google Analytics 4', hote: 'google-analytics.com' }
     ⚠️ Ajouter une entrée ici ne charge rien : c'est une DÉCLARATION. Le chargement se fait
     dans la page, sous `surAccord(cat, …)`. Les deux vont ensemble, jamais l'un sans l'autre. */
  var TRACEURS = [];

  var CATEGORIES = [
    {
      id: 'mesure',
      titre: { fr: "Mesure d'audience", en: 'Audience measurement' },
      desc: {
        fr: "Comprendre quelles pages sont lues et d'où viennent les visiteurs, pour améliorer le site.",
        en: 'Understanding which pages are read and where visitors come from, to improve the site.',
      },
    },
    {
      id: 'marketing',
      titre: { fr: 'Marketing', en: 'Marketing' },
      desc: {
        fr: "Mesurer l'efficacité de nos campagnes et vous proposer nos contenus ailleurs sur le web.",
        en: 'Measuring how our campaigns perform and showing you our content elsewhere on the web.',
      },
    },
  ];

  var T = {
    titre: { fr: 'Cookies', en: 'Cookies' },
    intro: {
      fr: 'Nous utilisons des traceurs pour mesurer la fréquentation du site. Vous pouvez les refuser : le site fonctionne exactement de la même façon.',
      en: 'We use trackers to measure site traffic. You may refuse them: the site works exactly the same way.',
    },
    refuser: { fr: 'Tout refuser', en: 'Reject all' },
    perso: { fr: 'Personnaliser', en: 'Customise' },
    accepter: { fr: 'Tout accepter', en: 'Accept all' },
    enSavoir: { fr: 'Politique de confidentialité', en: 'Privacy Policy' },
    panneau: { fr: 'Vos préférences de cookies', en: 'Your cookie preferences' },
    fermer: { fr: 'Fermer', en: 'Close' },
    necTitre: { fr: 'Strictement nécessaires', en: 'Strictly necessary' },
    necDesc: {
      fr: "Votre préférence de langue et l'enregistrement du choix ci-dessous. Tout reste dans votre navigateur. Ces éléments ne demandent pas votre consentement (article 82 de la loi Informatique et Libertés) et ne peuvent pas être désactivés.",
      en: 'Your language preference and the record of the choice below. Everything stays in your browser. These require no consent (article 82 of the French Data Protection Act) and cannot be switched off.',
    },
    necEtat: { fr: 'Toujours actif', en: 'Always on' },
    rien: {
      fr: "Ce site ne pose aujourd'hui aucun traceur soumis à consentement : ni mesure d'audience, ni publicité, ni bouton de réseau social. Il n'y a donc rien à accepter ni à refuser. Si cela change, cette fenêtre vous le demandera avant tout dépôt.",
      en: 'This site currently sets no tracker subject to consent: no audience measurement, no advertising, no social button. There is therefore nothing to accept or refuse. Should that change, this window will ask you before anything is stored.',
    },
    enregistrer: { fr: 'Enregistrer mes choix', en: 'Save my choices' },
    depuis: { fr: 'Choix enregistré le', en: 'Choice recorded on' },
    gerer: { fr: 'Gérer mes cookies', en: 'Manage cookies' },
  };

  var lang = 'fr';
  var L = function (o) {
    return o[lang] || o.fr;
  };

  /* Les catégories réellement en jeu : une finalité sans traceur déclaré n'a rien à demander. */
  function categoriesActives() {
    return CATEGORIES.filter(function (c) {
      return TRACEURS.some(function (t) {
        return t.cat === c.id;
      });
    });
  }

  function lire() {
    try {
      var brut = localStorage.getItem(CLE);
      if (!brut) return null;
      var e = JSON.parse(brut);
      if (!e || e.v !== VERSION) return null;
      if (!e.t || Date.now() - e.t > DUREE_MS) return null; // périmé → on redemande
      return e;
    } catch (err) {
      return null;
    }
  }

  function ecrire(choix) {
    var e = { v: VERSION, t: Date.now(), choix: choix };
    try {
      localStorage.setItem(CLE, JSON.stringify(e));
    } catch (err) {
      /* Stockage refusé (navigation privée stricte) : le choix ne survit pas au rechargement.
         On continue quand même — la session en cours doit respecter ce que l'utilisateur vient
         de dire, même si on ne peut pas s'en souvenir demain. */
    }
    etat = e;
    notifier();
  }

  var etat = lire();
  var abonnes = [];

  function autorise(cat) {
    return Boolean(etat && etat.choix && etat.choix[cat] === true);
  }

  function notifier() {
    abonnes.forEach(function (a) {
      if (!a.fait && autorise(a.cat)) {
        a.fait = true;
        try {
          a.fn();
        } catch (err) {
          /* Une balise qui casse ne doit pas emporter les suivantes. */
        }
      }
    });
  }

  /* ── Rendu ─────────────────────────────────────────────────────────────────────────────── */

  var el = {}; // références des nœuds construits

  function txt(tag, cls, contenu) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (contenu != null) n.textContent = contenu;
    return n;
  }

  function construirePanneau() {
    if (el.panneau) return el.panneau;
    var actives = categoriesActives();

    var dlg = document.createElement('dialog');
    dlg.className = 'ck-dlg';
    dlg.setAttribute('aria-labelledby', 'ck-titre');

    var boite = txt('div', 'ck-box');
    var haut = txt('div', 'ck-head');
    var h = txt('h2', null, L(T.panneau));
    h.id = 'ck-titre';
    var fermer = txt('button', 'ck-x', '×');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', L(T.fermer));
    fermer.addEventListener('click', function () {
      dlg.close();
    });
    haut.appendChild(h);
    haut.appendChild(fermer);
    boite.appendChild(haut);

    var corps = txt('div', 'ck-body');

    // Toujours en premier : ce qui ne se négocie pas, et pourquoi.
    var nec = txt('div', 'ck-cat');
    var necH = txt('div', 'ck-cathead');
    necH.appendChild(txt('h3', null, L(T.necTitre)));
    necH.appendChild(txt('span', 'ck-always', L(T.necEtat)));
    nec.appendChild(necH);
    nec.appendChild(txt('p', null, L(T.necDesc)));
    corps.appendChild(nec);

    el.bascules = {};
    if (!actives.length) {
      corps.appendChild(txt('p', 'ck-rien', L(T.rien)));
    } else {
      actives.forEach(function (c) {
        var bloc = txt('div', 'ck-cat');
        var tete = txt('div', 'ck-cathead');
        tete.appendChild(txt('h3', null, L(c.titre)));

        var lab = txt('label', 'ck-sw');
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = autorise(c.id); // jamais pré-coché tant que rien n'a été accepté
        inp.setAttribute('aria-label', L(c.titre));
        lab.appendChild(inp);
        lab.appendChild(txt('span', 'ck-track'));
        tete.appendChild(lab);
        el.bascules[c.id] = inp;

        bloc.appendChild(tete);
        bloc.appendChild(txt('p', null, L(c.desc)));

        var noms = TRACEURS.filter(function (t) {
          return t.cat === c.id;
        }).map(function (t) {
          return t.nom;
        });
        if (noms.length) bloc.appendChild(txt('p', 'ck-liste', noms.join(' · ')));
        corps.appendChild(bloc);
      });
    }

    boite.appendChild(corps);

    var pied = txt('div', 'ck-foot');
    var date = txt('span', 'ck-date', '');
    pied.appendChild(date);
    el.date = date;

    var lien = txt('a', 'ck-link', L(T.enSavoir));
    lien.href = '/confidentialite';
    pied.appendChild(lien);

    if (actives.length) {
      var ok = txt('button', 'btn btn-primary ck-save', L(T.enregistrer));
      ok.type = 'button';
      ok.addEventListener('click', function () {
        var choix = {};
        actives.forEach(function (c) {
          choix[c.id] = el.bascules[c.id].checked;
        });
        ecrire(choix);
        dlg.close();
        cacherBandeau();
      });
      pied.appendChild(ok);
    }
    boite.appendChild(pied);
    dlg.appendChild(boite);
    document.body.appendChild(dlg);
    el.panneau = dlg;
    majDate();
    return dlg;
  }

  function majDate() {
    if (!el.date) return;
    if (!etat) {
      el.date.textContent = '';
      return;
    }
    var d = new Date(etat.t);
    el.date.textContent =
      L(T.depuis) + ' ' + d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR');
  }

  function construireBandeau() {
    var b = txt('div', 'ck-bar');
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', L(T.titre));
    var w = txt('div', 'ck-barwrap');

    var t = txt('div', 'ck-bartext');
    t.appendChild(txt('p', null, L(T.intro)));
    var a = txt('a', 'ck-link', L(T.enSavoir));
    a.href = '/confidentialite';
    t.appendChild(a);
    w.appendChild(t);

    var actions = txt('div', 'ck-actions');
    /* « Tout refuser » d'abord et de MÊME POIDS que « Tout accepter » : c'est la symétrie
       exigée par la CNIL. Ne pas transformer l'un des deux en lien discret. */
    var non = txt('button', 'btn ck-btn', L(T.refuser));
    non.type = 'button';
    non.addEventListener('click', function () {
      var c = {};
      categoriesActives().forEach(function (x) {
        c[x.id] = false;
      });
      ecrire(c);
      cacherBandeau();
    });

    var perso = txt('button', 'ck-more', L(T.perso));
    perso.type = 'button';
    perso.addEventListener('click', ouvrir);

    var oui = txt('button', 'btn ck-btn ck-yes', L(T.accepter));
    oui.type = 'button';
    oui.addEventListener('click', function () {
      var c = {};
      categoriesActives().forEach(function (x) {
        c[x.id] = true;
      });
      ecrire(c);
      cacherBandeau();
    });

    actions.appendChild(non);
    actions.appendChild(perso);
    actions.appendChild(oui);
    w.appendChild(actions);
    b.appendChild(w);
    document.body.appendChild(b);
    el.bandeau = b;
    return b;
  }

  function cacherBandeau() {
    if (el.bandeau) {
      el.bandeau.remove();
      el.bandeau = null;
    }
  }

  function ouvrir() {
    var dlg = construirePanneau();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  /* ── Amorçage ──────────────────────────────────────────────────────────────────────────── */

  function demarrer() {
    // Lien permanent du pied de page : le retrait doit être aussi simple que l'accord.
    document.querySelectorAll('[data-ck-open]').forEach(function (n) {
      n.addEventListener('click', function (e) {
        e.preventDefault();
        ouvrir();
      });
    });

    // Le bandeau, et seulement s'il y a réellement quelque chose à demander.
    if (categoriesActives().length && !etat) construireBandeau();
    notifier();
  }

  if (typeof I18N !== 'undefined' && I18N.on) {
    I18N.on(function (l) {
      lang = l;
      // Reconstruire à la volée : le panneau est bâti en JS, il ne porte pas de `data-en`.
      if (el.panneau) {
        el.panneau.remove();
        el.panneau = null;
      }
      if (el.bandeau) {
        cacherBandeau();
        if (categoriesActives().length && !etat) construireBandeau();
      }
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();

  return {
    /** L'utilisateur a-t-il accordé cette finalité ? */
    autorise: autorise,
    /** Ouvre le panneau de préférences (lien « Gérer mes cookies »). */
    ouvrir: ouvrir,
    /** L'état brut, pour inspection. */
    etat: function () {
      return etat;
    },
    /**
     * LA PORTE. Exécute `fn` dès que la finalité est accordée — jamais avant, jamais deux fois.
     * Tout chargement de tiers passe par ici : c'est la seule façon de garantir qu'aucun octet
     * ne part avant le clic.
     */
    surAccord: function (cat, fn) {
      var a = { cat: cat, fn: fn, fait: false };
      abonnes.push(a);
      notifier();
    },
  };
})();
