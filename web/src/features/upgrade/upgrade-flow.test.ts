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
    expect(vueDepuis(resume({ statut: 'source_uploaded' })).fermable).toBe(false)
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
    expect(resteEstimeS(vueDepuis(resume({ statut: 'paid' })))).toBeNull()
    const debut = resteEstimeS(vueDepuis(resume({ statut: 'running', faites: 0, total: 34 })))
    expect(debut).toBe(DUREE_TOTALE_S)
  })

  it('ne descend jamais à zéro : « il reste 0 s » depuis une minute est pire que « bientôt »', () => {
    const fin = resteEstimeS(vueDepuis(resume({ statut: 'running', faites: 34, total: 34 })))
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
