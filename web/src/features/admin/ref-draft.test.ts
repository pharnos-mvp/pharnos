import { describe, expect, it } from 'vitest'

import { COUNTRIES } from '@/features/workspace/dossier-constants'
import { entryError, fromServerEntry, nextLabel, prefillEntry, toPayload } from './ref-draft'
import type { RefEntryFull, RefVersionRow } from './admin-api'

// L'éditeur god sérialise/désérialise le contenu réglementaire : toute asymétrie entre
// `toPayload` et `fromServerEntry` corromprait silencieusement une entrée au simple
// rechargement d'un brouillon (ouvrir puis enregistrer ≠ no-op). D'où l'aller-retour exhaustif.

const SECTIONS = ['agency', 'fees', 'submission', 'samples'] as const
/** Pays UEMOA du socle (les 8 premiers de COUNTRIES) — le périmètre réel du référentiel. */
const UEMOA = COUNTRIES.slice(0, 8).map((c) => c.code)

const asServerRow = (country: string, section: string, payload: unknown): RefEntryFull => ({
  id: '00000000-0000-4000-8000-000000000001',
  version_id: '00000000-0000-4000-8000-000000000002',
  country,
  section,
  payload,
  provenance: { texte: 'Décret test n° 1 du 2026-01-01', jo: 'JO test' },
  created_at: '2026-01-01T00:00:00Z',
})

describe('aller-retour éditeur ↔ payload', () => {
  it('préremplissage → payload → rechargement → payload : STABLE (8 pays × 4 sections)', () => {
    for (const country of UEMOA) {
      for (const section of SECTIONS) {
        const draft = prefillEntry(country, section)
        const p1 = toPayload(draft)
        const reloaded = fromServerEntry(asServerRow(country, section, p1))
        const p2 = toPayload(reloaded)
        expect(p2, `${country}/${section}`).toEqual(p1)
        // La provenance serveur est bien restituée (rechargement d'un brouillon existant).
        expect(reloaded.provTexte).toBe('Décret test n° 1 du 2026-01-01')
        expect(reloaded.provJo).toBe('JO test')
      }
    }
  })

  it('une entrée valide côté client est EFFECTIVE côté Edge (agency: nom présent)', () => {
    for (const country of UEMOA) {
      const draft = prefillEntry(country, 'agency')
      draft.provTexte = 'Arrêté test'
      expect(entryError(draft), country).toBeNull()
      const p = toPayload(draft) as { name: string; full: string }
      expect(p.name.trim() !== '' || p.full.trim() !== '', country).toBe(true)
    }
  })

  it('une civilité inconnue ne s’invente pas : repli sur le socle', () => {
    const socle = prefillEntry('SN', 'agency')
    const row = asServerRow('SN', 'agency', { ...(toPayload(socle) as object), sexe: 'X' })
    expect(fromServerEntry(row).agSexe).toBe(socle.agSexe)
  })

  it('préremplit depuis le CONTENU COURANT quand il existe (jamais le socle en silence)', () => {
    const current = new Map([
      [
        'SN|fees',
        {
          country: 'SN',
          section: 'fees',
          payload: { currency: 'FCFA', fees: { new_ma: 999_000 } },
          provenance: { texte: 'Décret 2025-1833' },
          version_label: 'v2026.1',
        },
      ],
    ])
    const draft = prefillEntry('SN', 'fees', current)
    expect(draft.feeNewMa).toBe('999000')
    // La provenance reste VIDE : une nouvelle version cite SA source, pas celle d'avant.
    expect(draft.provTexte).toBe('')
    // Couple absent de la carte → socle.
    expect(prefillEntry('SN', 'agency', current).agName).not.toBe('')
  })
})

describe('validation locale (entryError)', () => {
  it('refuse une provenance absente', () => {
    const draft = prefillEntry('SN', 'fees')
    expect(entryError(draft)).not.toBeNull()
  })

  it('refuse un montant SAISI mais illisible (sinon il serait omis en silence)', () => {
    const draft = prefillEntry('SN', 'fees')
    draft.provTexte = 'Décret test'
    draft.feeNewMa = '1,2 million'
    expect(entryError(draft)?.fr).toContain('illisible')
    draft.feeNewMa = '1 000 000' // espaces (y c. insécables) admis
    expect(entryError(draft)).toBeNull()
  })

  it('refuse des listes d’échantillons FR/EN désappariées', () => {
    const draft = prefillEntry('SN', 'samples')
    draft.provTexte = 'Décret test'
    draft.samplesNewMaFr = 'a\nb'
    draft.samplesNewMaEn = 'a'
    expect(entryError(draft)).not.toBeNull()
  })
})

describe('nextLabel', () => {
  const v = (label: string): RefVersionRow => ({
    id: '00000000-0000-4000-8000-000000000003',
    label,
    status: 'published',
    effective_date: null,
    release_note: '',
    published_at: null,
    created_at: '2026-01-01T00:00:00Z',
    is_baseline: false,
  })
  const year = new Date().getFullYear()

  it('propose N+1 de l’année courante et ignore les autres années', () => {
    expect(nextLabel([v(`v${year}.4`), v(`v${year - 1}.9`)])).toBe(`v${year}.5`)
    expect(nextLabel([])).toBe(`v${year}.1`)
  })

  it('plafonne à 999 (la regex serveur refuse 4 chiffres)', () => {
    expect(nextLabel([v(`v${year}.999`)])).toBe(`v${year}.999`)
  })
})
