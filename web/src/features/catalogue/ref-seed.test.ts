import { describe, expect, it } from 'vitest'

import { listAgencies, regulatoryProfileFor } from '@/features/workspace/roadmap-data'
import { buildRefSeedStatements } from './ref-seed'

/**
 * PHASE DE CONSTRUCTION (décision CEO 2026-07-27) — ce que ce test garde, et ce qu'il ne garde
 * plus.
 *
 * Il verrouillait la PARITÉ TEXTUELLE entre `roadmap-data.ts` et la section seed de la migration
 * 0071 : toucher au socle dans le code cassait le build tant qu'on n'avait pas régénéré la
 * migration ou publié une version. C'était juste tant que le socle était publié en base — c'est
 * devenu un frottement pur depuis `0080`, qui vide les entrées de la version socle pour que le
 * CODE redevienne seul maître pendant la construction. Le CEO doit pouvoir corriger une redevance
 * du Bénin en éditant une ligne, sans procédure de publication : il est seul, sans pilote, et le
 * socle n'est pas finalisé pour plusieurs pays.
 *
 * Ce qui reste verrouillé est ce qui compte VRAIMENT : **le générateur doit continuer de couvrir
 * tout le socle**, parce que c'est l'OUTIL DU JOUR J. Au signal du CEO on le lance
 * (`npm run ref:seed-sql`), on colle sa sortie dans une migration, et le protocole s'allume avec
 * le contenu réel du code. Un générateur qui aurait cessé de voir un pays ou une section
 * publierait un socle AMPUTÉ — et là, l'opposabilité serait en jeu.
 *
 * Procédure complète : `docs/PLAN-ORG-REFERENTIEL.md` § « Bascule GO-LIVE du référentiel ».
 */
describe('générateur de socle — l’outil de bascule GO-LIVE', () => {
  const stmts = buildRefSeedStatements()

  it('produit UNE entrée par agence du code', () => {
    // Dérivé du CODE, jamais d'un nombre écrit à la main : ajouter un pays fait bouger l'attendu.
    const agencies = listAgencies()
    expect(agencies.length).toBeGreaterThan(0)
    expect(stmts.filter((s) => s.includes("'agency'"))).toHaveLength(agencies.length)
    for (const { code } of agencies)
      expect(
        stmts.some((s) => s.includes(`'${code}', 'agency'`)),
        `agence ${code} absente du socle généré`,
      ).toBe(true)
  })

  it('n’oublie AUCUNE section renseignée dans le code', () => {
    // Le vrai risque du jour J : un pays dont les redevances existent dans le code mais que le
    // générateur ne sérialise pas → socle publié amputé, sans que rien ne le signale.
    for (const { code: country } of listAgencies()) {
      const p = regulatoryProfileFor(country)
      const has = (section: string) => stmts.some((s) => s.includes(`'${country}', '${section}'`))
      if (p?.fees && Object.keys(p.fees).length > 0)
        expect(has('fees'), `redevances ${country} présentes au code mais pas générées`).toBe(true)
      if (p?.submissionNote)
        expect(has('submission'), `dépôt ${country} présent au code mais pas généré`).toBe(true)
      if (p?.samples && Object.keys(p.samples).length > 0)
        expect(has('samples'), `échantillons ${country} présents au code mais pas générés`).toBe(
          true,
        )
    }
  })

  it('cite une provenance dans CHAQUE entrée (l’Edge et la RPC la refusent sans)', () => {
    for (const s of stmts.filter((s) => s.includes('ref_entries')))
      expect(s, `entrée sans provenance :\n${s.slice(0, 140)}…`).toMatch(/"texte"\s*:/)
  })

  it('reste du SQL exécutable : un statement terminé, aux littéraux équilibrés', () => {
    for (const s of stmts) {
      expect(s.trimEnd().endsWith(';')).toBe(true)
      // Une apostrophe française non doublée casserait la migration du jour J : hors littéraux
      // bien formés, il ne doit plus rester une seule apostrophe orpheline.
      expect(
        s.replace(/'(?:[^']|'')*'/g, ''),
        `apostrophe non échappée :\n${s.slice(0, 140)}…`,
      ).not.toContain("'")
    }
  })
})
