import { beforeEach, describe, expect, it } from 'vitest'

import { db, type RefEntryRecord, type RefVersionRecord } from '@/lib/db'
import { refUpdatePreview, structureRowLabel, structureRowsFor } from './ref-diff'

/**
 * Le bloc « Structure du Module 1 » du dialogue de CONSENTEMENT (P4.5).
 *
 * C'est la surface la plus chère du chantier : ce que l'admin d'une organisation lit avant
 * d'accepter une mise à jour réglementaire. Deux bugs y ont survécu à une revue chacun —
 * l'énumération brute des versions entrantes (qui annonçait un retrait déjà annulé, et taisait le
 * retour de l'exigence), puis une clé de comparaison ignorant la PORTÉE (qui faisait dire « rien
 * ne change » à un resserrage d'activités). D'où ces tests : le diff de structure se lit sur les
 * états RÉSOLUS de part et d'autre, jamais sur les payloads empilés.
 */

const ORG = 'org-diff'
const t = (v: { fr: string; en: string }) => v.fr

const version = (patch: Partial<RefVersionRecord> & { id: string }): RefVersionRecord => ({
  label: patch.id,
  status: 'published',
  effectiveDate: null,
  releaseNote: '',
  publishedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isBaseline: patch.id === 'v-1',
  ...patch,
})

const entry = (patch: Partial<RefEntryRecord> & { id: string }): RefEntryRecord => ({
  versionId: 'v-1',
  country: 'TG',
  section: 'ctd_structure',
  payload: {},
  provenance: { texte: 'Arrêté de test' },
  createdAt: '2026-07-01T00:00:00.000Z',
  ...patch,
})

const adopt = (versionId: string) =>
  db.orgRefAdoptions.put({
    id: `a-${ORG}-${versionId}`,
    orgId: ORG,
    versionId,
    adoptedAt: '2026-07-02T00:00:00.000Z',
    adoptedByEmail: 'admin@ex.com',
  })

beforeEach(async () => {
  await db.refVersions.clear()
  await db.refEntries.clear()
  await db.orgRefAdoptions.clear()
  await db.orgRefOverrides.clear()
})

/** Socle + v2 (retrait du PGHT) + v3 paramétrable ; l'org est au plafond v2. */
async function seed(v3Payload: unknown) {
  await db.refVersions.bulkPut([
    version({ id: 'v-1' }),
    version({ id: 'v-2', createdAt: '2026-07-02T00:00:00.000Z' }),
    version({ id: 'v-3', createdAt: '2026-07-03T00:00:00.000Z' }),
  ])
  await db.refEntries.bulkPut([
    entry({
      id: 'e-2',
      versionId: 'v-2',
      payload: { deltas: [{ kind: 'remove', number: '1.1.2' }] },
    }),
    entry({ id: 'e-3', versionId: 'v-3', payload: v3Payload }),
  ])
  await adopt('v-2')
  return refUpdatePreview(ORG, 'v-3', 'fr', { country: 'TG' })
}

describe('structureDiff — ce que l’adoption va VRAIMENT faire à l’arborescence', () => {
  it('annonce le RETOUR de l’exigence quand la version suivante ne reconduit pas le retrait', async () => {
    // Le payload d'une section REMPLACE celui de la version précédente : v3 qui ne parle que de
    // 1.3.3 remet 1.1.2 en vigueur. Empiler les deltas des versions entrantes annonçait l'inverse.
    const preview = await seed({
      deltas: [{ kind: 'relabel', number: '1.3.3', label: 'Étiquetage et conditionnement' }],
    })
    const rows = preview!.structure
    const back = rows.find((r) => r.number === '1.1.2')!
    expect(back.reverted).toBe(true)
    expect(structureRowLabel(back, t)).toContain('de nouveau exigée')
    expect(rows.find((r) => r.number === '1.3.3')?.reverted).toBe(false)
  })

  it('un RESSERRAGE de portée est annoncé, jamais « rien ne change »', async () => {
    // Même genre, même numéro, même libellé — seule la portée change. Une clé courte les
    // confondait : le dialogue affichait « aucune valeur ne change » juste avant de remettre
    // 1.1.2 en exigence pour le renouvellement, la réponse aux notifications et le transfert.
    const preview = await seed({
      deltas: [{ kind: 'remove', number: '1.1.2', activities: ['new_ma'] }],
    })
    expect(preview!.structure).toHaveLength(2)
    expect(preview!.structure.filter((r) => r.reverted)).toHaveLength(1)

    // Pour un dossier de NOUVELLE AMM, les deux lignes se neutralisent : rien ne bouge chez lui.
    expect(structureRowsFor(preview!.structure, 'ctd', 'new_ma')).toHaveLength(0)
    // Pour un RENOUVELLEMENT, l'exigence revient — et il doit le lire.
    const renewal = structureRowsFor(preview!.structure, 'ctd', 'renewal')
    expect(renewal).toHaveLength(1)
    expect(renewal[0]!.reverted).toBe(true)
  })

  it('une ABROGATION (`reset`) annonce le retour de TOUS les écarts nationaux', async () => {
    const preview = await seed({ reset: true, deltas: [] })
    expect(preview!.structure).toEqual([
      expect.objectContaining({ country: 'TG', kind: 'remove', number: '1.1.2', reverted: true }),
    ])
  })

  it('reconduire le MÊME delta ne produit aucune ligne (pas de bruit pour du néant)', async () => {
    const preview = await seed({ deltas: [{ kind: 'remove', number: '1.1.2' }] })
    expect(preview!.structure).toEqual([])
  })

  it('un delta non scopé n’est PAS annoncé à un dossier de variation CTD (M4)', async () => {
    const preview = await seed({
      deltas: [
        { kind: 'remove', number: '1.1.2' },
        { kind: 'relabel', number: '1.2.1', label: 'Formulaire national' },
      ],
    })
    expect(structureRowsFor(preview!.structure, 'ctd', 'variation')).toEqual([])
    // …mais bien à un renouvellement CTD, et à une variation eCTD (arbre standard).
    expect(structureRowsFor(preview!.structure, 'ctd', 'renewal')).toHaveLength(1)
    expect(structureRowsFor(preview!.structure, 'ectd', 'variation')).toHaveLength(1)
  })
})
