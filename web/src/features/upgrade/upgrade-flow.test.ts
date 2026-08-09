import { describe, expect, it } from 'vitest'

import {
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
} from './upgrade-flow'

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
