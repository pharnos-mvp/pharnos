import { describe, expect, it } from 'vitest'

import type { ProductRecord } from '@/lib/db'
import {
  buildFillContent,
  extractLegacySkeletonState,
  formStateFromContent,
  hasFormMarkers,
} from './form-content'
import { countEmptyFields, emptyFormState, formExportName, initialFormState } from './form-types'
import { LABELING_FORM_DEFINITION } from './labeling-form-model'
import { NOTICE_FORM_DEFINITION, HCP } from './notice-form-model'
import { RCP_FORM_DEFINITION, RCP_FORM_MODEL } from './rcp-form-model'

const product = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  forme: 'Solution injectable',
  presentation: 'flacon de 2 ml',
} as ProductRecord

describe('modèles : clés de saisie uniques (round-trip sans collision)', () => {
  for (const def of [RCP_FORM_DEFINITION, NOTICE_FORM_DEFINITION, LABELING_FORM_DEFINITION]) {
    it(def.docType, () => {
      const keys: string[] = []
      for (const b of def.model) {
        if ('key' in b && b.key) keys.push(b.key)
        if (b.type === 'atc') keys.push(b.chkKey)
      }
      expect(new Set(keys).size).toBe(keys.length)
    })
  }
})

describe('RCP — compatibilité du format PR #112 (round-trip identique)', () => {
  it('réhydrate valeurs, multilignes, cases, ATC et durée', () => {
    const state = emptyFormState(RCP_FORM_MODEL)
    state.values.denomination = 'KV-Kacin 500 mg, solution injectable'
    state.values.posologie = 'Adulte : 15 mg/kg/jour.\n\nEnfant : avis spécialisé.'
    state.values.amm_tel = '+229 21 30 00 00'
    state.values.classe_pharma = 'Aminosides'
    state.values.code_atc = 'J01GB06'
    state.values.duree_nombre = '36'
    state.checks.interactions_chk = [0, 2]
    state.checks.atc_non_attribue = [0]
    state.checks.prescription_chk = [1]

    const content = buildFillContent(RCP_FORM_DEFINITION, state)
    expect(hasFormMarkers(content)).toBe(true)
    const back = formStateFromContent(RCP_FORM_DEFINITION, content)
    expect(back.values.denomination).toBe(state.values.denomination)
    expect(back.values.posologie).toBe(state.values.posologie)
    expect(back.values.amm_tel).toBe(state.values.amm_tel)
    expect(back.values.code_atc).toBe('J01GB06')
    expect(back.values.duree_nombre).toBe('36')
    expect(back.checks.interactions_chk).toEqual([0, 2])
    expect(back.checks.atc_non_attribue).toEqual([0])
    expect(back.checks.prescription_chk).toEqual([1])
    expect(back.values.surdosage).toBe('')
  })

  it('préfill STRICTEMENT Identification + compteur', () => {
    const state = initialFormState(RCP_FORM_DEFINITION, product)
    const filled = Object.entries(state.values).filter(([, v]) => v.trim() !== '')
    expect(filled.map(([k]) => k).sort()).toEqual(['composition', 'denomination', 'forme'])
    const total = Object.keys(state.values).length
    expect(countEmptyFields(state)).toBe(total - 3)
    expect(formExportName(RCP_FORM_DEFINITION, state)).toMatch(/^RCP_KV_Kacin_500/)
  })
})

describe('Notice — round-trip (globals, selects, cases conditionnelles, subLine)', () => {
  it('persiste et réhydrate les réglages globaux + tous les types de blocs', () => {
    const state = initialFormState(NOTICE_FORM_DEFINITION, product)
    state.globals = { verb: 'utiliser', hcp: { medecin: true, pharmacien: false, infirmier: true } }
    state.values.posologie = 'Une ovule par jour.'
    state.values.excipients_notoires = 'du lactose' // subLine
    state.checks.amelioration = [0]
    state.values.amelioration_jours = '3'
    state.checks.enfants_av = [0] // check asHeading
    state.values.enfants_av_txt = 'Réservé à l’adulte.'
    state.selects.grossesse_sel = 'Grossesse et allaitement'
    state.checks.conduite_so = [0]

    const content = buildFillContent(NOTICE_FORM_DEFINITION, state)
    const back = formStateFromContent(NOTICE_FORM_DEFINITION, content)
    expect(back.globals.verb).toBe('utiliser')
    expect(back.globals.hcp).toEqual({ medecin: true, pharmacien: false, infirmier: true })
    expect(back.values.posologie).toBe('Une ovule par jour.')
    expect(back.values.excipients_notoires).toBe('du lactose')
    expect(back.checks.amelioration).toEqual([0])
    expect(back.values.amelioration_jours).toBe('3')
    expect(back.checks.enfants_av).toEqual([0])
    expect(back.values.enfants_av_txt).toBe('Réservé à l’adulte.')
    expect(back.selects.grossesse_sel).toBe('Grossesse et allaitement')
    expect(back.checks.conduite_so).toEqual([0])
  })

  it('textes dynamiques RÉSOLUS dans le document (verbe « utiliser », HCP sans pharmacien)', () => {
    const state = initialFormState(NOTICE_FORM_DEFINITION, product)
    state.globals = {
      verb: 'utiliser',
      hcp: { medecin: true, pharmacien: false, infirmier: false },
    }
    const content = buildFillContent(NOTICE_FORM_DEFINITION, state)
    const texts = (content.content ?? []).map((n) =>
      (n.content ?? []).map((c) => (c.type === 'listItem' ? '' : (c.text ?? ''))).join(''),
    )
    expect(texts.some((t) => t.includes('avant d’utiliser ce médicament car elle contient'))).toBe(
      true,
    )
    expect(texts.some((t) => t.includes('COMMENT UTILISER CE MEDICAMENT'))).toBe(true)
    expect(texts.some((t) => t.includes('N’utilisez jamais ce médicament'))).toBe(true)
    // HCP : médecin seul.
    expect(texts.some((t) => t.includes('Adressez-vous à votre médecin avant'))).toBe(true)
  })

  it('mention « amélioration » composée avec le délai saisi ; champ dépendant masqué sinon', () => {
    const state = initialFormState(NOTICE_FORM_DEFINITION, product)
    state.checks.amelioration = [0]
    state.values.amelioration_jours = '5'
    const content = buildFillContent(NOTICE_FORM_DEFINITION, state)
    const all = JSON.stringify(content)
    expect(all).toContain('moins bien après 5 jours.')

    // Case décochée → ni la mention ni le délai (dependsOn) dans le document.
    const off = initialFormState(NOTICE_FORM_DEFINITION, product)
    off.values.amelioration_jours = '5'
    const offDoc = JSON.stringify(buildFillContent(NOTICE_FORM_DEFINITION, off))
    expect(offDoc).not.toContain('amelioration_jours')
    expect(offDoc).not.toContain('aucune amélioration')
  })

  it('préfill Identification : dénomination + substances uniquement', () => {
    const state = initialFormState(NOTICE_FORM_DEFINITION, product)
    const filled = Object.entries(state.values).filter(([, v]) => v.trim() !== '')
    expect(filled.map(([k]) => k).sort()).toEqual(['denomination', 'substances'])
  })

  it('HCP : énumération « ou » du gabarit', () => {
    expect(
      HCP({ verb: 'prendre', hcp: { medecin: true, pharmacien: true, infirmier: true } }),
    ).toBe('votre médecin, votre pharmacien ou votre infirmier/ère')
    expect(
      HCP({ verb: 'prendre', hcp: { medecin: false, pharmacien: false, infirmier: false } }),
    ).toBe('votre médecin')
  })
})

describe('Étiquetage — round-trip (bandeaux, Sans objet, FAB/EXP)', () => {
  it('persiste et réhydrate lignes à libellés et groupes de cases', () => {
    const state = initialFormState(LABELING_FORM_DEFINITION, product)
    state.values.fab_date = '01/2026'
    state.values.exp_date = '01/2029'
    state.values.lot = 'B1234'
    state.checks.excipients_chk = [0] // Sans objet.
    state.checks.picto_chk = [2]
    state.checks.b_nature_chk = [0]

    const content = buildFillContent(LABELING_FORM_DEFINITION, state)
    const back = formStateFromContent(LABELING_FORM_DEFINITION, content)
    expect(back.values.fab_date).toBe('01/2026')
    expect(back.values.exp_date).toBe('01/2029')
    expect(back.values.lot).toBe('B1234')
    expect(back.checks.excipients_chk).toEqual([0])
    expect(back.checks.picto_chk).toEqual([2])
    expect(back.checks.b_nature_chk).toEqual([0])
    // Bandeaux : headings marqués banner, mentions statiques officielles présentes.
    const banners = (content.content ?? []).filter((n) => n.attrs?.banner === true)
    expect(banners.length).toBeGreaterThan(20)
    expect(JSON.stringify(content)).toContain('Lire la notice avant utilisation.')
    expect(JSON.stringify(content)).toContain('Tenir hors de la vue et de la portée des enfants.')
  })

  it('préfill Identification (dénominations A/B/C, composition, forme/contenu)', () => {
    const state = initialFormState(LABELING_FORM_DEFINITION, product)
    expect(state.values.denomination).toContain('KV-Kacin 500')
    expect(state.values.substances).toBe('Amikacine')
    expect(state.values.composition).toContain('Amikacine')
    expect(state.values.forme_contenu).toBe('Solution injectable — flacon de 2 ml')
    expect(state.values.b_denomination).toContain('KV-Kacin 500')
    expect(state.values.c_denomination).toContain('KV-Kacin 500')
    expect(formExportName(LABELING_FORM_DEFINITION, state)).toMatch(/^Etiquetage_KV_Kacin/)
  })
})

describe('contenus valides pour le pull zod (T6)', () => {
  it('les trois formulaires passent parseTiptapContent', async () => {
    const { parseTiptapContent } = await import('../tiptap-schema')
    for (const def of [RCP_FORM_DEFINITION, NOTICE_FORM_DEFINITION, LABELING_FORM_DEFINITION]) {
      const state = initialFormState(def, product)
      state.checks[Object.keys(state.checks)[0]!] = [0]
      expect(parseTiptapContent(buildFillContent(def, state))).not.toBeNull()
    }
  })
})

describe('anciens squelettes [À COMPLÉTER] (legacy)', () => {
  it('récupère les saisies RCP sous les titres de rubrique, ignore les placeholders', () => {
    const legacy = {
      type: 'doc',
      content: [
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
      ],
    }
    const state = extractLegacySkeletonState(RCP_FORM_DEFINITION, legacy)
    expect(state.values.denomination).toBe('KV-Kacin 500, solution')
    expect(state.values.indications).toBe('')
    expect(hasFormMarkers(legacy)).toBe(false)
    expect(formStateFromContent(RCP_FORM_DEFINITION, legacy).values.denomination).toBe(
      'KV-Kacin 500, solution',
    )
  })
})
