import { describe, expect, it } from 'vitest'

import { CONFORMITY_SPECS, flattenRubrics } from '@specs'

import {
  avancementVisible,
  DOC_TYPES,
  DUREE_TOTALE_S,
  doitChercherSource,
  doitSonder,
  enImpasse,
  estDocType,
  MAX_SOURCE_OCTETS,
  resteEstimeS,
  validerFichierSource,
  vueDepuis,
  type ResumeCommande,
  libellePhase,
  bandeauContexte,
  dureeLisible,
  rubriquesVivantes,
} from './upgrade-flow'

/** Les 34 identifiants du gabarit RCP, tels que la porte les met en file. */
const flattenRubriquesRcp = () => flattenRubrics(CONFORMITY_SPECS.rcp).map((r) => r.id)

const resume = (o: Partial<ResumeCommande> = {}): ResumeCommande => ({
  statut: 'paid',
  phase: 'conformity',
  faites: 0,
  total: 0,
  echecs: 0,
  pret: false,
  depositsLeft: 3,
  expireLe: '2026-09-03T10:00:00.000Z',
  ...o,
})

describe('vueDepuis', () => {
  it('sans réponse serveur, la page ne prétend rien', () => {
    // Un jeton expiré ou inconnu ne doit surtout pas retomber sur l'écran de dépôt : l'acheteur
    // téléverserait un document que rien ne viendrait chercher.
    expect(vueDepuis(null).etape).toBe('expire')
  })

  it('une commande payée sans dépôt demande le document', () => {
    const v = vueDepuis(resume({ statut: 'paid' }))
    expect(v.etape).toBe('depot')
    expect(v.peutRedeposer).toBe(true)
  })

  it('un refus de recevabilité ramène au dépôt, sans consommer de crédit', () => {
    // `gated_out` n'est PAS une panne : la commande est intacte et l'acheteur peut redéposer.
    // L'afficher en erreur ferait ouvrir un litige là où une phrase suffit.
    const v = vueDepuis(resume({ statut: 'gated_out', depositsLeft: 2 }))
    expect(v.etape).toBe('depot')
    expect(v.peutRedeposer).toBe(true)
  })

  it('la préparation N’EST PAS fermable — elle tourne dans l’onglet', () => {
    // ⚠️ La promesse « vous pouvez fermer cette page » ne vaut qu'à partir du moment où le SERVEUR
    // travaille. Pendant la lecture du PDF (et surtout pendant la reconnaissance de caractères, ~4 s
    // par page), fermer perdrait tout et renverrait l'acheteur au dépôt.
    const enCours = vueDepuis(resume({ statut: 'source_uploaded' }), { preparationEnCours: true })
    expect(enCours.etape).toBe('preparation')
    expect(enCours.fermable).toBe(false)
    expect(vueDepuis(resume({ statut: 'paid' }), { preparationEnCours: true }).etape).toBe(
      'preparation',
    )
  })

  it('le traitement est fermable : c’est la promesse de la maquette, et elle devient vraie ici', () => {
    const v = vueDepuis(resume({ statut: 'running', faites: 17, total: 34 }))
    expect(v.etape).toBe('traitement')
    expect(v.fermable).toBe(true)
    expect(v.progression).toBeCloseTo(0.5)
  })

  it('un total à zéro ne produit JAMAIS de NaN', () => {
    // Entre deux phases, le total est légitimement nul le temps que la file se remplisse. `0/0`
    // vaut `NaN`, qui traverse une barre de progression sans erreur et l'affiche vide ou pleine
    // selon le navigateur.
    const v = vueDepuis(resume({ statut: 'running', faites: 0, total: 0 }))
    expect(Number.isFinite(v.progression)).toBe(true)
    expect(v.progression).toBe(0)
  })

  it('la progression ne dépasse jamais 1', () => {
    // `sections_total` peut retarder d'une transition : 4 faites sur 3 annoncées est possible.
    expect(vueDepuis(resume({ statut: 'running', faites: 4, total: 3 })).progression).toBe(1)
  })

  it('« prêt » vient du STATUT, jamais d’un décompte', () => {
    // ⚠️ Entre deux phases les compteurs sont à zéro sur la nouvelle, et « 0 sur 0 » vaut
    // mathématiquement 100 %. Annoncer la livraison sur cette base ferait cliquer l'acheteur sur un
    // téléchargement qui n'existe pas encore.
    expect(vueDepuis(resume({ statut: 'running', faites: 0, total: 0, pret: false })).etape).toBe(
      'traitement',
    )
    expect(vueDepuis(resume({ statut: 'done', pret: true })).etape).toBe('livraison')
  })

  it('une panne est présentée comme une panne, jamais comme une attente', () => {
    const v = vueDepuis(resume({ statut: 'failed', erreur: 'phase conformity : echec' }))
    expect(v.etape).toBe('panne')
    expect(v.fermable).toBe(false)
  })
})

describe('enImpasse', () => {
  it('distingue le refus rattrapable de l’impasse', () => {
    expect(enImpasse(resume({ statut: 'gated_out', depositsLeft: 1 }))).toBe(false)
    expect(enImpasse(resume({ statut: 'gated_out', depositsLeft: 0 }))).toBe(true)
    // Une commande en cours n'est jamais « en impasse », même sans dépôt restant.
    expect(enImpasse(resume({ statut: 'running', depositsLeft: 0 }))).toBe(false)
  })
})

describe('doitSonder', () => {
  it('on ne sonde QUE pendant le traitement', () => {
    // ⚠️ ~150 requêtes par onglet oublié, sur une surface publique. On s'arrête dès qu'un état
    // stable est atteint.
    expect(doitSonder(vueDepuis(resume({ statut: 'running' })))).toBe(true)
    for (const statut of ['paid', 'gated_out', 'done', 'failed']) {
      const r = resume({ statut, pret: statut === 'done' })
      expect(doitSonder(vueDepuis(r))).toBe(false)
    }
  })
})

describe('resteEstimeS', () => {
  it('estime depuis la durée MESURÉE, et seulement pendant le traitement', () => {
    expect(resteEstimeS(vueDepuis(resume({ statut: 'paid' })), 'conformity')).toBeNull()
    const debut = resteEstimeS(
      vueDepuis(resume({ statut: 'running', faites: 0, total: 34 })),
      'conformity',
    )
    expect(debut).toBe(DUREE_TOTALE_S)
  })

  it("⚠️ l'estimation ne REMONTE JAMAIS d'une phase à la suivante", () => {
    // Le défaut que ce test ferme — et que sa version précédente VERROUILLAIT au lieu de voir :
    // `vue.progression` est l'avancement de la phase COURANTE (un compteur global reculerait,
    // décision de `resumer()`), or on la multipliait par la durée des TROIS passes. À 34/34 de
    // conformité l'écran annonçait « 10 s », puis la traduction démarrait à 0/34 et il annonçait
    // « 6 min » : l'estimation s'allongeait sous les yeux de l'acheteur, mot pour mot ce que le
    // commentaire de `DUREE_TOTALE_S` interdit.
    const finConformite = resteEstimeS(
      vueDepuis(resume({ statut: 'running', faites: 34, total: 34 })),
      'conformity',
    )!
    const debutTraduction = resteEstimeS(
      vueDepuis(resume({ statut: 'running', phase: 'translation', faites: 0, total: 25 })),
      'translation',
    )!
    const finTraduction = resteEstimeS(
      vueDepuis(resume({ statut: 'running', phase: 'translation', faites: 25, total: 25 })),
      'translation',
    )!
    const debutRevue = resteEstimeS(
      vueDepuis(resume({ statut: 'running', phase: 'report', faites: 0, total: 4 })),
      'report',
    )!
    expect(debutTraduction).toBeLessThanOrEqual(finConformite)
    expect(debutRevue).toBeLessThanOrEqual(finTraduction)
    // Et l'ordre de grandeur vient des MESURES de U0.3 : à la fin de la conformité il reste la
    // traduction (56 s) et la revue (114 s) — pas « une minute ».
    expect(finConformite).toBeGreaterThan(120)
  })

  it('une phase INCONNUE ne prétend rien', () => {
    // `null` vaut mieux qu'un chiffre calculé sur une phase que cette version ne connaît pas.
    expect(
      resteEstimeS(vueDepuis(resume({ statut: 'running', faites: 1, total: 4 })), 'assemblage'),
    ).toBeNull()
  })

  it('ne descend jamais à zéro : « il reste 0 s » depuis une minute est pire que « bientôt »', () => {
    const fin = resteEstimeS(
      vueDepuis(resume({ statut: 'running', phase: 'report', faites: 4, total: 4 })),
      'report',
    )
    expect(fin).toBeGreaterThanOrEqual(10)
  })
})

describe('doitChercherSource', () => {
  it('demande au serveur ce qu’il détient avant de réclamer un fichier', () => {
    // Sans cela, l'acheteur qui vient du pont se verrait redemander un document déjà téléversé —
    // et ce second dépôt consommerait une des trois tentatives d'une commande payée.
    expect(doitChercherSource(resume({ statut: 'paid' }))).toBe(true)
    expect(doitChercherSource(resume({ statut: 'source_uploaded' }))).toBe(true)
  })

  it('⚠️ JAMAIS après un refus : le document le plus récent est celui que la porte a écarté', () => {
    // Le redemander, ce serait le re-préparer, le re-soumettre, se le voir refuser à nouveau — et
    // épuiser les trois dépôts sans que l'acheteur ait jamais pu fournir le bon fichier.
    expect(doitChercherSource(resume({ statut: 'gated_out' }))).toBe(false)
  })

  it('ni pendant ni après le travail : il n’y a plus rien à préparer', () => {
    for (const statut of ['running', 'done', 'failed']) {
      expect(doitChercherSource(resume({ statut }))).toBe(false)
    }
    expect(doitChercherSource(null)).toBe(false)
  })
})

describe('validerFichierSource', () => {
  const f = (o: Partial<{ name: string; size: number; type: string }> = {}) => ({
    name: 'rcp.pdf',
    size: 1024,
    type: 'application/pdf',
    ...o,
  })

  it('un PDF ordinaire passe', () => {
    expect(validerFichierSource(f())).toBeNull()
    expect(validerFichierSource(f({ size: MAX_SOURCE_OCTETS }))).toBeNull()
  })

  it('refuse ici ce qui coûterait un dépôt là-bas', () => {
    // Ce contrôle n'est PAS la garantie — le serveur reconstate le type réel sur l'objet déposé.
    // Il évite qu'un `.docx` consomme une des trois tentatives d'une commande déjà payée.
    expect(
      validerFichierSource(f({ type: 'application/vnd.openxmlformats', name: 'a.docx' })),
    ).toBe('type')
    expect(validerFichierSource(f({ size: 0 }))).toBe('vide')
    expect(validerFichierSource(f({ size: MAX_SOURCE_OCTETS + 1 }))).toBe('taille')
  })

  it('un type MIME absent ne fait pas refuser un PDF légitime', () => {
    // Certains systèmes rendent une chaîne vide sur un PDF parfaitement valide : refuser là-dessus
    // renverrait l'acheteur chercher un problème qui n'existe pas.
    expect(validerFichierSource(f({ type: '', name: 'Gynoril RCP.PDF' }))).toBeNull()
    expect(validerFichierSource(f({ type: '', name: 'rcp.docx' }))).toBe('type')
  })
})

describe('estDocType', () => {
  it('liste FERMÉE — le type commande le gabarit contre lequel la porte juge', () => {
    for (const d of DOC_TYPES) expect(estDocType(d)).toBe(true)
    // ⚠️ Une notice jugée contre le gabarit du RCP serait refusée pour une raison qui n'existe pas.
    for (const poison of ['constructor', 'toString', '__proto__', 'pght', '', null, 7]) {
      expect(estDocType(poison)).toBe(false)
    }
  })
})

describe('vueDepuis — échec de lecture', () => {
  it('un PDF illisible ROUVRE le dépôt, il n’enferme pas dans un sablier', () => {
    // ⚠️ `source_uploaded` est écrit par le serveur dès qu'il CONSTATE le fichier, donc bien avant
    // que le navigateur ait réussi à le lire. Sans cette sortie, un PDF protégé par mot de passe —
    // courant en affaires réglementaires — laissait l'acheteur sur l'étape « préparation » : aucun
    // sondage, aucun bouton, et un rechargement qui relit le même fichier illisible. Ses deux
    // dépôts restants étaient inatteignables sur une commande payée.
    const bloque = vueDepuis(resume({ statut: 'source_uploaded' }), { preparationEnCours: true })
    expect(bloque.etape).toBe('preparation')
    const libre = vueDepuis(resume({ statut: 'source_uploaded' }), { echecLecture: true })
    expect(libre.etape).toBe('depot')
    expect(libre.peutRedeposer).toBe(true)
  })

  it('mais tant qu’une lecture est EN COURS, elle a le dernier mot', () => {
    // Sinon un échec précédent ferait clignoter l'écran de dépôt par-dessus la nouvelle tentative.
    const v = vueDepuis(resume({ statut: 'source_uploaded' }), {
      echecLecture: true,
      preparationEnCours: true,
    })
    expect(v.etape).toBe('preparation')
  })

  it('et il ne recouvre JAMAIS un travail lancé, fini ou en panne', () => {
    // Une fois le moteur parti, l'échec de lecture appartient au passé : proposer un dépôt
    // relancerait un traitement à ~2 $ sur une commande qui en a déjà un.
    expect(vueDepuis(resume({ statut: 'running' }), { echecLecture: true }).etape).toBe(
      'traitement',
    )
    expect(vueDepuis(resume({ statut: 'done', pret: true }), { echecLecture: true }).etape).toBe(
      'livraison',
    )
    expect(vueDepuis(resume({ statut: 'failed' }), { echecLecture: true }).etape).toBe('panne')
  })
})

describe('vueDepuis — « source déposée » sans rien en vol', () => {
  it('⚠️ propose de REPRENDRE, jamais un sablier ni un second dépôt', () => {
    // La page démarre TOUJOURS la préparation sur `source_uploaded` : s'y retrouver au repos, c'est
    // que le téléchargement ou la porte a échoué. C'était le dernier sablier définitif de cet
    // écran — un « ne fermez pas cet onglet » sous lequel plus rien ne tournait, sans un bouton.
    const v = vueDepuis(resume({ statut: 'source_uploaded' }))
    expect(v.etape).toBe('reprise')
    // ⚠️ PAS un `depot` : le fichier est déjà là et son dépôt est déjà décompté. En proposer un
    // second ferait payer à l'acheteur un incident réseau qui n'est pas le sien.
    expect(v.etape).not.toBe('depot')
    expect(doitSonder(v)).toBe(false)
  })

  it('tant qu’une préparation tourne, c’est elle qu’on montre', () => {
    expect(
      vueDepuis(resume({ statut: 'source_uploaded' }), { preparationEnCours: true }).etape,
    ).toBe('preparation')
  })

  it('un échec de LECTURE, lui, rouvre bien le dépôt — c’est le fichier qui est en cause', () => {
    expect(vueDepuis(resume({ statut: 'source_uploaded' }), { echecLecture: true }).etape).toBe(
      'depot',
    )
  })
})

describe('vueDepuis — porte à reprendre', () => {
  it('⚠️ un téléversement RÉUSSI puis une porte en panne ne fait pas payer un 2ᵉ dépôt', () => {
    // `order-gate` n'écrit rien avant d'avoir jugé, donc le statut reste `paid` : l'écran retombait
    // sur `depot`, et son SEUL bouton était le sélecteur de fichier — c'est-à-dire une deuxième
    // tentative sur trois, pour un incident réseau qui n'est pas celui de l'acheteur.
    const sans = vueDepuis(resume({ statut: 'paid' }))
    expect(sans.etape).toBe('depot')
    const avec = vueDepuis(resume({ statut: 'paid' }), { porteAReprendre: true })
    expect(avec.etape).toBe('reprise')
  })

  it('la reprise gratuite ne recouvre jamais un travail lancé, fini ou en panne', () => {
    for (const [statut, attendu] of [
      ['running', 'traitement'],
      ['done', 'livraison'],
      ['failed', 'panne'],
    ] as const) {
      const v = vueDepuis(resume({ statut, pret: statut === 'done' }), { porteAReprendre: true })
      expect(v.etape).toBe(attendu)
    }
  })

  it('un fichier ILLISIBLE l’emporte : c’est le document qu’il faut remplacer', () => {
    // Les deux ne coexistent pas en pratique (la porte suppose une lecture réussie), mais l'ordre
    // doit être explicite : redéposer répare un mauvais fichier, refranchir ne répare qu'un réseau.
    const v = vueDepuis(resume({ statut: 'paid' }), {
      porteAReprendre: true,
      echecLecture: true,
    })
    expect(v.etape).toBe('depot')
  })
})

describe('libellePhase (LOT B3)', () => {
  it('une source ANGLAISE ne subit jamais une « Traduction anglaise »', () => {
    expect(libellePhase('conformity', 'en')).toEqual({
      fr: 'Version française',
      en: 'French version',
    })
    expect(libellePhase('translation', 'en')).toEqual({
      fr: 'Version anglaise au standard',
      en: 'English version to the standard',
    })
  })

  it('une source française garde les libellés historiques', () => {
    expect(libellePhase('conformity', 'fr')).toEqual({
      fr: 'Mise en conformité',
      en: 'Compliance pass',
    })
    expect(libellePhase('translation', 'fr')).toEqual({
      fr: 'Traduction anglaise',
      en: 'English translation',
    })
    // Un job d'avant la migration 0093 (`null`) se lit comme une source française.
    expect(libellePhase('translation', null)).toEqual(libellePhase('translation', 'fr'))
  })

  it('la revue ne dépend pas de la langue source, et une phase inconnue retombe sur la première', () => {
    expect(libellePhase('report', 'en')).toEqual(libellePhase('report', 'fr'))
    expect(libellePhase('phase-de-2027', 'en')).toEqual(libellePhase('conformity', 'en'))
  })
})

describe('rubriquesVivantes + bandeauContexte + dureeLisible (LOT B1)', () => {
  it('ordonne sur le GABARIT et titre depuis la même source que le moteur', () => {
    const sections = [
      { id: '4.8', st: 'queued' },
      { id: '1', st: 'done', o: 'filled' },
      { id: '4.2-posologie', st: 'running' },
    ]
    const r = rubriquesVivantes(sections, 'rcp', 'fr')
    // L'ordre est celui du gabarit (1 avant 4.2 avant 4.8), pas celui du serveur.
    expect(r.map((x) => x.id)).toEqual(['1', '4.2', '4.8'])
    expect(r[0]).toMatchObject({ titre: 'DÉNOMINATION DU MÉDICAMENT', st: 'done', o: 'filled' })
    // Un MORCEAU ne s'affiche jamais : c'est la rubrique qu'il découpe qui porte son état, sous
    // son numéro officiel et son titre de gabarit. Afficher les morceaux mettait plusieurs lignes
    // sous le même numéro.
    expect(r[1]).toMatchObject({
      id: '4.2',
      titre: "Posologie et mode d'administration",
      st: 'running',
    })
    // En anglais, les titres viennent de la table de l'assemblage — pas d'une liste parallèle.
    const en = rubriquesVivantes(sections, 'rcp', 'en')
    expect(en[0]?.titre).toBe('NAME OF THE MEDICINAL PRODUCT')
  })

  it('⚠️ les SOUS-DÉCOUPAGES ne sont pas des lignes — leur état remonte, les numéros restent uniques', () => {
    // Le serveur crée une ligne pour les 34 entrées du gabarit. Afficher les morceaux mettait
    // trois lignes « 4.2 » et quatre « 4.6 » dans la liste — le même numéro plusieurs fois, sur la
    // page qui vend la rigueur réglementaire. Le document, lui, n'a qu'une rubrique 4.2.
    const sections = [
      { id: '4', st: 'done', o: 'filled' },
      { id: '4.1', st: 'done', o: 'filled' },
      { id: '4.2', st: 'done', o: 'filled' },
      { id: '4.2-posologie', st: 'done', o: 'filled' },
      { id: '4.2-administration', st: 'running' },
      { id: '4.6', st: 'done', o: 'filled' },
      { id: '4.6-grossesse', st: 'done', o: 'filled' },
      { id: '4.6-allaitement', st: 'done', o: 'missing' },
      { id: '4.6-fertilite', st: 'done', o: 'filled' },
    ]
    const r = rubriquesVivantes(sections, 'rcp', 'fr')
    expect(r.map((x) => x.id)).toEqual(['4', '4.1', '4.2', '4.6'])
    // Aucun morceau ne ressort par la porte de derrière (la boucle des hors-gabarit).
    expect(r.some((x) => x.id.includes('-'))).toBe(false)
    // Le numéro affiché est unique — c'était le défaut visible.
    expect(new Set(r.map((x) => x.id)).size).toBe(r.length)
    // 4.2 : un morceau tourne encore ⇒ la rubrique est EN COURS, même si sa ligne propre est
    // `done`. L'état d'une rubrique découpée se dérive, il ne se lit pas.
    expect(r.find((x) => x.id === '4.2')).toMatchObject({ st: 'running' })
    // 4.6 : tout est fini, mais une moitié n'a pas de donnée ⇒ le verdict le plus SÉVÈRE gouverne.
    expect(r.find((x) => x.id === '4.6')).toMatchObject({ st: 'done', o: 'missing' })
    // 4 : ses enfants sont des rubriques, pas des morceaux — il garde son propre état.
    expect(r.find((x) => x.id === '4')).toMatchObject({ st: 'done', o: 'filled' })
  })

  it('⚠️ la ligne du CHAPEAU compte : une rubrique en échec ne s’affiche jamais verte', () => {
    // `order-gate` crée une ligne par entrée du gabarit : 4.2 a son propre appel moteur, son propre
    // statut et son propre verdict. Une première version ne lisait que les morceaux et
    // court-circuitait le chapeau — une rubrique en ÉCHEC s'affichait « Reprise » en vert, pendant
    // que le bandeau du bas annonçait « 1 rubrique en échec ». Trouvé en revue de diff.
    const avec = (chapeau: { st: string; o?: string }) =>
      rubriquesVivantes(
        [
          { id: '4.2', ...chapeau },
          { id: '4.2-posologie', st: 'done', o: 'filled' },
          { id: '4.2-administration', st: 'done', o: 'filled' },
        ],
        'rcp',
        'fr',
      ).find((x) => x.id === '4.2')

    expect(avec({ st: 'failed' })).toMatchObject({ st: 'failed' })
    expect(avec({ st: 'running' })).toMatchObject({ st: 'running' })
    // Le verdict du chapeau compte aussi : « manquant » ne se fait pas effacer par ses morceaux.
    expect(avec({ st: 'done', o: 'missing' })).toMatchObject({ st: 'done', o: 'missing' })
  })

  it('⚠️ `agreger` est fail-safe : un statut inconnu ne devient jamais un badge vert', () => {
    // Le front et les Edge se déploient séparément : un statut serveur que ce build ne connaît pas
    // ne doit pas être présenté comme « Reprise » sur les onglets déjà ouverts. Et un `done` sans
    // verdict ne remonte pas mieux que ce qu'on sait.
    const etat = (morceaux: { id: string; st: string; o?: string }[]) =>
      rubriquesVivantes([...morceaux], 'rcp', 'fr').find((x) => x.id === '4.2')

    expect(
      etat([
        { id: '4.2', st: 'done', o: 'filled' },
        { id: '4.2-posologie', st: 'skipped' },
        { id: '4.2-administration', st: 'done', o: 'filled' },
      ]),
    ).toMatchObject({ st: 'skipped' })
    expect(
      etat([
        { id: '4.2', st: 'done' },
        { id: '4.2-posologie', st: 'done', o: 'filled' },
      ]),
    ).toMatchObject({ st: 'done', o: 'partial' })
  })

  it('le compteur annonce 29, le chiffre que l’acheteur peut vérifier en comptant ses lignes', () => {
    // Le serveur envoie les 34 entrées et un `total` de 34 ; l'écran doit dire 29 — et surtout le
    // MÊME nombre que les lignes affichées, sans quoi l'acheteur voit le mensonge tout seul.
    const sections = flattenRubriquesRcp().map((id) => ({
      id,
      st: 'done' as const,
      o: 'filled' as const,
    }))
    const r = resume({ statut: 'running', faites: 34, total: 34, docType: 'rcp', sections })
    const a = avancementVisible(r)
    expect(a.total).toBe(29)
    expect(a.faites).toBe(29)
    expect(rubriquesVivantes(sections, 'rcp', 'fr')).toHaveLength(a.total)
    // Et la barre suit le même décompte que le texte.
    expect(vueDepuis(r).progression).toBe(1)
  })

  it('⚠️ une rubrique dont un morceau TOURNE n’est pas comptée faite', () => {
    // L'état réel pendant les cinq minutes du traitement — celui que le test « tout done » ne
    // couvrait pas. Si le compteur lisait la ligne propre de 4.2 (`done`) au lieu de l'agrégat, il
    // annoncerait 29/29 pendant que la liste affiche encore « 4.2 en cours ».
    const sections = flattenRubriquesRcp().map((id) => ({
      id,
      st: id === '4.2-administration' ? 'running' : 'done',
      o: 'filled',
    }))
    const r = resume({ statut: 'running', faites: 33, total: 34, docType: 'rcp', sections })
    expect(avancementVisible(r)).toEqual({ faites: 28, total: 29 })
    expect(rubriquesVivantes(sections, 'rcp', 'fr').find((x) => x.id === '4.2')?.st).toBe('running')
  })

  it('sans liste de rubriques, on rend les chiffres du serveur plutôt qu’une correction à l’aveugle', () => {
    const a = avancementVisible(resume({ statut: 'running', faites: 3, total: 34 }))
    expect(a).toEqual({ faites: 3, total: 34 })
  })

  it('⚠️ HORS conformité, `sections` ne dit plus rien : la barre doit suivre le SERVEUR', () => {
    // `resumer()` n'envoie QUE les lignes de conformité dans `sections`, quelle que soit la phase
    // courante. Pendant la traduction et la revue — la moitié du traitement payé — elles sont donc
    // toutes `done` : les lire épinglait la barre à 100 % et l'estimation à son plancher, écran
    // figé, pendant que le moteur travaillait. Trouvé en revue de diff.
    const toutesFaites = flattenRubriquesRcp().map((id) => ({
      id,
      st: 'done' as const,
      o: 'filled' as const,
    }))
    const traduction = resume({
      statut: 'running',
      phase: 'translation',
      faites: 4,
      total: 31,
      docType: 'rcp',
      sections: toutesFaites,
    })
    expect(avancementVisible(traduction)).toEqual({ faites: 4, total: 31 })
    expect(vueDepuis(traduction).progression).toBeCloseTo(4 / 31)
    // Et l'estimation redescend au fil de la phase au lieu de rester collée à son plancher.
    const debut = resteEstimeS(vueDepuis(traduction), 'translation')!
    const fin = resteEstimeS(vueDepuis({ ...traduction, faites: 31 }), 'translation')!
    expect(fin).toBeLessThan(debut)
  })

  it('une rubrique HORS gabarit ferme la marche au lieu de disparaître', () => {
    const r = rubriquesVivantes(
      [
        { id: 'zz-inconnue', st: 'queued' },
        { id: '1', st: 'done' },
      ],
      'rcp',
      'fr',
    )
    expect(r.map((x) => x.id)).toEqual(['1', 'zz-inconnue'])
  })

  it('le bandeau contexte ne dit QUE ce qui est su', () => {
    expect(
      bandeauContexte({ produit: 'KV-RL', country: 'BF', activity: 'amm', sourceLang: 'en' }, 'fr'),
    ).toBe('KV-RL · Burkina Faso · Nouvelle AMM · anglais → français')
    // Une source française annonce l'autre sens ; un pays inconnu n'invente rien.
    expect(
      bandeauContexte({ produit: null, country: 'XX', activity: null, sourceLang: 'fr' }, 'en'),
    ).toBe('French → English')
    expect(
      bandeauContexte({ produit: null, country: null, activity: null, sourceLang: null }, 'fr'),
    ).toBeNull()
    expect(bandeauContexte(null, 'fr')).toBeNull()
  })

  it('dureeLisible : la durée réelle du mockup (« 4 min 12 »), jamais reformatée en promesse', () => {
    expect(dureeLisible(252, 'fr')).toBe('4 min 12')
    expect(dureeLisible(252, 'en')).toBe('4 min 12 s')
    expect(dureeLisible(58, 'fr')).toBe('58 s')
    expect(dureeLisible(240, 'fr')).toBe('4 min')
  })
})
