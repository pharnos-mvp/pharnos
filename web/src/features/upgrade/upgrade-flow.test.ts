import { describe, expect, it } from 'vitest'

import {
  DUREE_TOTALE_S,
  doitSonder,
  enImpasse,
  resteEstimeS,
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
