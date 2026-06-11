import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import {
  buildRcpFillContent,
  countEmptyRcpFields,
  extractLegacySkeletonState,
  hasRcpFormMarkers,
  initialRcpFormState,
  rcpFormStateFromContent,
} from './rcp-form-content'
import { emptyRcpFormState, RCP_FORM_MODEL } from './rcp-form-model'

const product = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  forme: 'Solution injectable',
} as ProductRecord

describe('RCP_FORM_MODEL', () => {
  it('clés de saisie uniques (round-trip sans collision)', () => {
    const keys: string[] = []
    for (const b of RCP_FORM_MODEL) {
      if ('key' in b && b.key) keys.push(b.key)
      if (b.type === 'atc') keys.push(b.chkKey)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('buildRcpFillContent / extractRcpFormState (round-trip)', () => {
  it('réhydrate à l’identique valeurs, multilignes, cases, ATC et durée', () => {
    const state = emptyRcpFormState()
    state.values.denomination = 'KV-Kacin 500 mg, solution injectable'
    state.values.posologie = 'Adulte : 15 mg/kg/jour.\n\nEnfant : avis spécialisé.'
    state.values.amm_tel = '+229 21 30 00 00' // line avec label « Tél. : »
    state.values.classe_pharma = 'Aminosides' // line avec label
    state.values.code_atc = 'J01GB06'
    state.values.duree_nombre = '36' // → « 36 mois »
    state.checks.interactions_chk = [0, 2]
    state.checks.atc_non_attribue = [0]
    state.checks.prescription_chk = [1]

    const content = buildRcpFillContent(state)
    expect(hasRcpFormMarkers(content)).toBe(true)
    const back = rcpFormStateFromContent(content)
    expect(back.values.denomination).toBe(state.values.denomination)
    expect(back.values.posologie).toBe(state.values.posologie)
    expect(back.values.amm_tel).toBe(state.values.amm_tel)
    expect(back.values.classe_pharma).toBe(state.values.classe_pharma)
    expect(back.values.code_atc).toBe(state.values.code_atc)
    expect(back.values.duree_nombre).toBe('36')
    expect(back.checks.interactions_chk).toEqual([0, 2])
    expect(back.checks.atc_non_attribue).toEqual([0])
    expect(back.checks.prescription_chk).toEqual([1])
    // Champ jamais saisi → vide après round-trip.
    expect(back.values.surdosage).toBe('')
  })

  it('document final : titres officiels + statiques toujours là, champs vides omis, cochés en puces', () => {
    const state = emptyRcpFormState()
    state.checks.elim_chk = [1]
    const content = buildRcpFillContent(state)
    const types = (content.content ?? []).map((n) => n.type)
    expect(types.filter((t) => t === 'heading').length).toBeGreaterThan(30)
    expect(types).toContain('horizontalRule')
    const lists = (content.content ?? []).filter((n) => n.type === 'bulletList')
    expect(lists).toHaveLength(1)
    // Aucun paragraphe de saisie (tout est vide) — seules les mentions statiques restent.
    const fillParas = (content.content ?? []).filter(
      (n) => n.type === 'paragraph' && typeof n.attrs?.fillKey === 'string',
    )
    expect(fillParas).toHaveLength(0)
  })

  it('contenu valide pour le pull zod (T6)', async () => {
    const { parseTiptapContent } = await import('../tiptap-schema')
    const state = initialRcpFormState(product)
    state.values.posologie = 'Ligne 1\nLigne 2'
    state.checks.preclinique_chk = [0]
    expect(parseTiptapContent(buildRcpFillContent(state))).not.toBeNull()
  })
})

describe('initialRcpFormState', () => {
  it('pré-remplit STRICTEMENT la session Identification (dénomination, composition, forme)', () => {
    const state = initialRcpFormState(product)
    expect(state.values.denomination).toBe('KV-Kacin 500, 500 mg / 2 ml, Solution injectable')
    expect(state.values.composition).toContain('Amikacine')
    expect(state.values.forme).toBe('Solution injectable')
    // Rien d'autre.
    const filled = Object.entries(state.values).filter(([, v]) => v.trim() !== '')
    expect(filled.map(([k]) => k).sort()).toEqual(['composition', 'denomination', 'forme'])
  })

  it('compteur de champs vides pour la bannière de revue', () => {
    const empty = emptyRcpFormState()
    const total = Object.keys(empty.values).length
    expect(countEmptyRcpFields(empty)).toBe(total)
    expect(countEmptyRcpFields(initialRcpFormState(product))).toBe(total - 3)
  })
})

describe('extractLegacySkeletonState (anciens squelettes [À COMPLÉTER])', () => {
  it('récupère les saisies sous les titres de rubrique, ignore les placeholders', () => {
    const legacy = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, locked: true },
          content: [{ type: 'text', text: 'RCP' }],
        },
        {
          type: 'heading',
          attrs: { level: 2, locked: true },
          content: [{ type: 'text', text: '1. DÉNOMINATION DU MÉDICAMENT' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'KV-Kacin 500, solution' }] },
        {
          type: 'heading',
          attrs: { level: 2, locked: true },
          content: [{ type: 'text', text: '4.1. Indications thérapeutiques' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '[À COMPLÉTER]' }] },
        {
          type: 'heading',
          attrs: { level: 2, locked: true },
          content: [{ type: 'text', text: '4.2. Posologie et mode d’administration' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '15 mg/kg/jour' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'en deux injections' }] },
      ],
    }
    const state = extractLegacySkeletonState(legacy)
    expect(state.values.denomination).toBe('KV-Kacin 500, solution')
    expect(state.values.indications).toBe('') // placeholder ignoré
    expect(state.values.posologie).toBe('15 mg/kg/jour\nen deux injections')
    // rcpFormStateFromContent route vers le mode legacy (aucun attr fillKey).
    expect(hasRcpFormMarkers(legacy)).toBe(false)
    expect(rcpFormStateFromContent(legacy).values.denomination).toBe('KV-Kacin 500, solution')
  })
})
