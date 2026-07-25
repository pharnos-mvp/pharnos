import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { RefEntryRecord, RefVersionRecord } from '@/lib/db'
import { resolveAuthority } from './ref-content'

/**
 * PARITÉ Edge ↔ résolveur client sur le contrat d'efficacité des payloads du référentiel.
 *
 * `supabase/functions/_shared/ref-payload.ts` décide ce que le God dashboard a le DROIT de
 * publier ; ce fichier-ci vérifie que le résolveur réel rend EXACTEMENT ce que l'Edge autorise,
 * sur la même table de fixtures (lue sur disque — les deux runtimes, Deno et Vite, ne peuvent
 * pas partager de module : même technique que `ref-seed.test.ts` pour la parité socle ↔ seed).
 *
 * Une dérive d'un seul côté produirait une panne SILENCIEUSE :
 *   • Edge plus permissif → « version publiée qui ne rend rien » (le god croit avoir publié) ;
 *   • Edge plus strict → publication refusée d'un contenu que le client afficherait.
 */

interface Fixture {
  case: string
  section: string
  payload: unknown
  effective: boolean
}

const FIXTURES: Fixture[] = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../supabase/functions/_shared/ref-payload-fixtures.json'),
    'utf8',
  ),
)

const VERSION: RefVersionRecord = {
  id: 'v-parity',
  label: 'v2026.9',
  status: 'published',
  effectiveDate: null,
  releaseNote: '',
  publishedAt: '2026-07-01T00:00:00.000Z',
  createdAt: '2026-07-01T00:00:00.000Z',
  isBaseline: false,
}

/**
 * Le résolveur ne renseigne `provenance[section]` que si le payload de cette section a produit
 * une valeur EXPLOITABLE (garde `take()` de `resolveAuthority`) — c'est donc l'observable exact
 * de « ce contenu rend quelque chose », sans exporter les normalisateurs privés.
 */
function clientRenders(section: string, payload: unknown): boolean {
  const entry: RefEntryRecord = {
    id: 'e-parity',
    versionId: VERSION.id,
    country: 'SN', // pays présent au socle : le repli existe, seul l'apport du payload est mesuré
    section,
    payload,
    provenance: { texte: 'Fixture de parité' },
    createdAt: '2026-07-01T00:00:00.000Z',
  }
  const rank = new Map([[VERSION.id, 1]])
  const resolved = resolveAuthority('SN', [entry], [VERSION], rank)
  return !!resolved?.provenance[section as keyof typeof resolved.provenance]
}

describe('parité Edge ↔ résolveur client (contrat des payloads publiables)', () => {
  it('la table de fixtures est lisible et couvre les deux sens', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20)
    expect(FIXTURES.some((f) => f.effective)).toBe(true)
    expect(FIXTURES.some((f) => !f.effective)).toBe(true)
  })

  for (const f of FIXTURES) {
    it(`${f.effective ? 'rend' : 'ignore'} — ${f.case}`, () => {
      expect(clientRenders(f.section, f.payload)).toBe(f.effective)
    })
  }
})
