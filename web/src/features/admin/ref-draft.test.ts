import { describe, expect, it } from 'vitest'

import { COUNTRIES } from '@/features/workspace/dossier-constants'
import { getModule1Tree } from '@/features/workspace/module1-tree'
import { flattenTree } from '@/features/workspace/tree-utils'
import {
  deltaScopeByFormat,
  draftDeltaIssues,
  draftToDelta,
  entryError,
  fromServerEntry,
  isBlockingDeltaIssue,
  newDelta,
  nextLabel,
  prefillEntry,
  removedSubtreeCount,
  toPayload,
  type CurrentMap,
  type DraftDelta,
} from './ref-draft'
import type { RefEntryFull, RefVersionRow } from './admin-api'

// L'éditeur god sérialise/désérialise le contenu réglementaire : toute asymétrie entre
// `toPayload` et `fromServerEntry` corromprait silencieusement une entrée au simple
// rechargement d'un brouillon (ouvrir puis enregistrer ≠ no-op). D'où l'aller-retour exhaustif.

const SECTIONS = ['agency', 'fees', 'submission', 'samples', 'ctd_structure'] as const
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

describe('structure du Module 1 (P4.5) — l’éditeur god des deltas', () => {
  const withProv = (deltas: DraftDelta[]) => ({
    ...prefillEntry('TG', 'ctd_structure'),
    deltas,
    provTexte: 'Arrêté n° 2026-042/MSHP du 14 mars 2026',
  })
  const delta = (patch: Partial<DraftDelta>): DraftDelta => ({ ...newDelta(), ...patch })

  it('le cas du CEO passe : « le PGHT n’est plus exigé au Togo »', () => {
    // 1.1.2 = « Lettre de PGHT (Prix Grossiste Hors Taxe) » dans MODULE1_CTD_UEMOA. Le nœud EXACT
    // compte : 1.2.6 est « Statut réglementaire régional et international » et porte les deux
    // nœuds AMM (1.2.6.1/1.2.6.2, cible de `NODE_BY_DOCTYPE.amm`) — publier l'un pour l'autre
    // retirerait le mauvais chapitre à tout un pays.
    const e = withProv([delta({ kind: 'remove', number: '1.1.2' })])
    expect(entryError(e)).toBeNull()
    expect(toPayload(e)).toEqual({ deltas: [{ kind: 'remove', number: '1.1.2' }] })
  })

  it('aller-retour éditeur ↔ payload sur un jeu de deltas complet', () => {
    const e = withProv([
      delta({ kind: 'remove', number: '1.1.2' }),
      delta({
        kind: 'add',
        number: '1.2.9',
        label: 'Attestation de pharmacovigilance',
        note: 'Signée du pharmacien responsable.',
        format: 'ctd',
      }),
      delta({
        kind: 'relabel',
        number: '1.3.3',
        label: 'Étiquetage et conditionnement',
        activities: ['renewal'],
      }),
    ])
    expect(entryError(e)).toBeNull()
    const p1 = toPayload(e)
    const reloaded = fromServerEntry(asServerRow('TG', 'ctd_structure', p1))
    expect(toPayload(reloaded)).toEqual(p1)
    // Le rechargement restitue les champs de saisie, pas seulement le payload.
    expect(reloaded.deltas[1]).toMatchObject({
      number: '1.2.9',
      format: 'ctd',
      note: expect.any(String),
    })
    expect(reloaded.deltas[2]?.activities).toEqual(['renewal'])
  })

  it('refuse une entrée SANS aucun changement (bannière de mise à jour pour du néant)', () => {
    expect(entryError(withProv([]))?.fr).toContain('au moins un changement')
  })

  it('refuse un numéro qui n’existe dans AUCUN arbre visé (delta inerte publié = moat cassé)', () => {
    const e = withProv([delta({ kind: 'remove', number: '9.9.9' })])
    expect(entryError(e)?.fr).toContain('n’existe dans aucune')
  })

  it('refuse un ajout orphelin et NOMME la ligne fautive', () => {
    const e = withProv([
      delta({ kind: 'remove', number: '1.1.2' }),
      delta({ kind: 'add', number: '1.99.1', label: 'Orpheline' }),
    ])
    expect(entryError(e)?.fr).toContain('#2')
    expect(entryError(e)?.fr).toContain('parent')
  })

  it('refuse un delta malformé (retrait d’une branche de 1er niveau) sans décaler les messages', () => {
    const e = withProv([
      delta({ kind: 'remove', number: '1.2' }), // branche entière → refusé par le contrat
      delta({ kind: 'remove', number: '1.1.2' }),
    ])
    expect(entryError(e)?.fr).toContain('#1')
  })

  it('la portée affichée est exacte FORMAT PAR FORMAT (M4 ne vise que l’arbre de variation CTD)', () => {
    const unscoped = draftToDelta(delta({ kind: 'remove', number: '1.1.2' }))!
    const scope = deltaScopeByFormat(unscoped)
    const ctd = scope.find((s) => s.format === 'ctd')!
    const ectd = scope.find((s) => s.format === 'ectd')!
    expect(ctd.activities).not.toContain('variation') // arbre de variation = opt-in
    expect(ctd.activities).toContain('new_ma')
    // En eCTD, une variation est montée sur l'arbre standard : le delta l'atteint vraiment.
    // Une portée agrégée aurait affiché « variation exclue » — faux pour la moitié des dossiers.
    expect(ectd.activities).toContain('variation')
  })

  it('un delta scopé « variation » n’affiche QUE la variation', () => {
    const scoped = draftToDelta(
      delta({ kind: 'remove', number: '1.1.2', format: 'ctd', activities: ['variation'] }),
    )!
    expect(deltaScopeByFormat(scoped)).toEqual([{ format: 'ctd', activities: ['variation'] }])
  })

  // ─── Régressions de la revue P4.5b (B1) : le contrôle d'effet se juge sur le contenu EN
  // VIGUEUR et sur la liste ENTIÈRE, jamais ligne à ligne contre le socle nu.

  it('n’INTERDIT pas le retour au libellé du socle : c’est un avis, pas une faute', () => {
    // Le payload REMPLACE la version précédente : revenir au libellé officiel = retirer la ligne.
    // La signaler est utile ; refuser d'enregistrer TOUT le brouillon (tous pays, toutes sections)
    // laisserait la correction réglementaire non publiée.
    const base = getModule1Tree('ctd', 'renewal')
    const socleLabel = flattenTree(base).find((n) => n.number === '1.3.3')!.label
    const e = withProv([
      delta({
        kind: 'relabel',
        number: '1.3.3',
        label: socleLabel,
        format: 'ctd',
        activities: ['renewal'],
      }),
      delta({ kind: 'remove', number: '1.1.2' }), // la vraie substance de la version
    ])
    expect(draftDeltaIssues(e)[0]).toBe('no_change')
    expect(isBlockingDeltaIssue(draftDeltaIssues(e)[0])).toBe(false)
    expect(entryError(e)).toBeNull()
  })

  it('REFUSE une entrée qui re-déclare exactement ce qui est déjà publié', () => {
    // Sinon : la cloche sonne chez tous les clients, l'admin adopte… pour zéro changement.
    const published = { deltas: [{ kind: 'remove', number: '1.1.2' }] }
    const current: CurrentMap = new Map([
      [
        'TG|ctd_structure',
        {
          country: 'TG',
          section: 'ctd_structure',
          payload: published,
          provenance: { texte: 'Arrêté 2026-042' },
          version_label: 'v2026.2',
        },
      ],
    ])
    const same = withProv([delta({ kind: 'remove', number: '1.1.2' })])
    expect(entryError(same, current)?.fr).toContain('déjà en vigueur')
    // …et le prérempli depuis le contenu courant PLUS un vrai changement passe.
    const evolved = {
      ...prefillEntry('TG', 'ctd_structure', current),
      provTexte: 'Arrêté n° 2026-043',
    }
    expect(evolved.deltas).toHaveLength(1) // le déjà-publié est bien rechargé (jamais effacé)
    evolved.deltas = [...evolved.deltas, delta({ kind: 'add', number: '1.2.9', label: 'Nouveau' })]
    expect(entryError(evolved, current)).toBeNull()
  })

  it('signale la ligne ANNULÉE par une autre ligne de la même entrée', () => {
    // `add 1.2.9` puis `remove 1.2.9` : les deux lignes sont bien formées, l'arbre final est celui
    // du socle. Le test différentiel désigne la bonne coupable — l'AJOUT ne sert à rien (le retrait,
    // lui, change bien le résultat : sans lui, 1.2.9 apparaîtrait). Une détection ligne-à-ligne
    // contre le socle ne voyait ni l'une ni l'autre et publiait l'entrée entière.
    const e = withProv([
      delta({ kind: 'add', number: '1.2.9', label: 'Éphémère' }),
      delta({ kind: 'remove', number: '1.2.9' }),
      delta({ kind: 'remove', number: '1.1.2' }),
    ])
    expect(draftDeltaIssues(e).slice(0, 2)).toEqual(['no_change', null])

    // Un ajout sous un parent que la MÊME entrée retire ne montera jamais : le parent EXISTE au
    // socle (donc pas « numéro inconnu »), il est seulement masqué par la ligne voisine — et pour
    // un ajout, cette contradiction interne reste BLOQUANTE : le god doit trancher.
    const e2 = withProv([
      delta({ kind: 'remove', number: '1.2.6' }),
      delta({ kind: 'add', number: '1.2.6.3', label: 'Sous un nœud retiré' }),
    ])
    expect(draftDeltaIssues(e2)[1]).toBe('masked')
    expect(isBlockingDeltaIssue('masked', 'add')).toBe(true)
    expect(entryError(e2)?.fr).toContain('#2')
  })

  it('annonce combien de sous-sections un retrait emporte', () => {
    // 1.2.6 porte les deux nœuds AMM : le god doit le voir AVANT de publier.
    expect(removedSubtreeCount(draftToDelta(delta({ kind: 'remove', number: '1.2.6' }))!)).toBe(2)
    expect(removedSubtreeCount(draftToDelta(delta({ kind: 'remove', number: '1.1.2' }))!)).toBe(0)
  })

  it('ABROGER est possible : un décret peut être abrogé, un pays n’est pas prisonnier à vie', () => {
    const current: CurrentMap = new Map([
      [
        'TG|ctd_structure',
        {
          country: 'TG',
          section: 'ctd_structure',
          payload: { deltas: [{ kind: 'remove', number: '1.1.2' }] },
          provenance: { texte: 'Arrêté 2026-042' },
          version_label: 'v2026.2',
        },
      ],
    ])
    const reset = { ...withProv([]), structureReset: true }
    expect(entryError(reset, current)).toBeNull()
    expect(toPayload(reset)).toEqual({ reset: true, deltas: [] })
    // Rien de publié pour ce pays ⇒ rien à abroger (publier du néant).
    expect(entryError(reset)?.fr).toContain('rien à abroger')
    // Et l'abrogation se relit comme telle (l'éditeur rouvre la case cochée, pas une liste vide).
    expect(
      fromServerEntry(asServerRow('TG', 'ctd_structure', toPayload(reset))).structureReset,
    ).toBe(true)
  })

  it('un doublon exact ne bloque PAS l’enregistrement (c’est le genre par défaut d’une ligne)', () => {
    // `remove` est le `kind` de `newDelta()` : deux lignes identiques sont l'accident le plus
    // probable de cet éditeur. Les déclarer « numéro inconnu » bloquait tout le brouillon.
    const e = withProv([
      delta({ kind: 'remove', number: '1.1.2' }),
      delta({ kind: 'remove', number: '1.1.2' }),
    ])
    expect(draftDeltaIssues(e)).toEqual([null, 'no_change'])
    expect(entryError(e)).toBeNull()
  })

  it('un décret qui cite le chapitre ET sa sous-section reste publiable', () => {
    const e = withProv([
      delta({ kind: 'remove', number: '1.2.6' }),
      delta({ kind: 'remove', number: '1.2.6.1' }),
    ])
    expect(draftDeltaIssues(e)[1]).toBe('masked') // déjà emporté par le retrait du parent
    expect(isBlockingDeltaIssue('masked', 'remove')).toBe(false)
    expect(entryError(e)).toBeNull()
  })

  it('rapporte la raison la MOINS sévère quand elle diffère selon l’arbre visé', () => {
    // 1.2.7 est amputé du seul arbre « nouvelle AMM » : le premier scope crierait « numéro
    // inconnu » alors que le nœud existe (et concorde) dans les quatre autres.
    const base = getModule1Tree('ctd', 'renewal')
    const label = flattenTree(base).find((n) => n.number === '1.2.7')!.label
    const e = withProv([
      // Scopé CTD : en eCTD le même numéro porte un autre libellé, le delta y serait EFFECTIF.
      delta({ kind: 'relabel', number: '1.2.7', label, format: 'ctd' }),
      delta({ kind: 'remove', number: '1.1.2' }),
    ])
    expect(draftDeltaIssues(e)[0]).toBe('no_change')
    expect(entryError(e)).toBeNull()
  })

  it('un delta saisi à moitié est signalé « incomplet », pas silencieusement ignoré', () => {
    // Sans ce refus, `toPayload` le jetterait et le god publierait une version amputée sans le voir.
    const e = withProv([delta({ kind: 'add', number: '1.2.9', label: '' })])
    expect(entryError(e)?.fr).toContain('incomplet')
    expect(toPayload(e)).toEqual({ deltas: [] })
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
