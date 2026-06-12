import { describe, expect, it } from 'vitest'

import type { JSONContent } from '@tiptap/core'
import type { ProductRecord } from '@/lib/db'
import { buildTemplateSkeleton, FILL_PLACEHOLDER } from './template-fill'

const product = (over: Partial<ProductRecord> = {}): ProductRecord =>
  ({
    id: 'p1',
    orgId: 'o1',
    nomCommercial: 'KV-Kacin 500',
    dci: 'Amikacine',
    dosage: '500 mg / 2 ml',
    forme: 'Solution injectable',
    presentation: 'flacon de 2 ml',
    classeTherapeutique: '',
    codeAtc: '',
    titulaire: 'KESHAVLAL VAJECHAND',
    fabricant: 'PHARMAX INDIA',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...over,
  }) as ProductRecord

const flatten = (doc: JSONContent) => {
  const out: Array<{ type: string; locked: boolean; text: string }> = []
  const walk = (n: JSONContent) => {
    out.push({
      type: n.type ?? '',
      locked: n.attrs?.locked === true,
      text: (n.content ?? []).map((c) => c.text ?? '').join(''),
    })
    if (n.type === 'doc') for (const c of n.content ?? []) walk(c)
  }
  walk(doc)
  return out.slice(1) // sans le nœud doc
}

describe('buildTemplateSkeleton', () => {
  it('RCP : document du FORMULAIRE officiel (gabarit CEO) — titres verrouillés, ordonnés', () => {
    const doc = buildTemplateSkeleton('rcp', product())!
    const nodes = flatten(doc)
    const headings = nodes.filter((n) => n.type === 'heading')
    expect(headings.every((h) => h.locked)).toBe(true) // structure FIGÉE
    const texts = headings.map((h) => h.text)
    expect(texts[0]).toBe('RESUME DES CARACTERISTIQUES DU PRODUIT')
    const idx = (frag: string) => texts.findIndex((t) => t.includes(frag))
    expect(idx('1.  DENOMINATION')).toBeLessThan(idx('2.  COMPOSITION'))
    expect(idx('4.8.  Effets indésirables')).toBeGreaterThan(idx('4.1.  Indications'))
    expect(idx('10.  DATE DE MISE A JOUR')).toBeGreaterThan(idx('9.  DATE DE PREMIERE'))
    expect(idx('CONDITIONS DE PRESCRIPTION')).toBeGreaterThan(idx('10.  DATE'))
    // Structure officielle 7 / 7 bis (modèle CEO) — toujours présente.
    expect(idx('7 bis.  FABRICANT')).toBeGreaterThan(idx('7.  TITULAIRE'))
  })

  it('RCP : pré-remplissage STRICTEMENT Identification produit, champs vides OMIS', () => {
    const doc = buildTemplateSkeleton('rcp', product())!
    const paras = flatten(doc).filter((n) => n.type === 'paragraph')
    // 1/2/3 pré-remplis depuis la fiche produit.
    expect(paras.some((p) => p.text.includes('KV-Kacin 500'))).toBe(true)
    expect(paras.some((p) => p.text.includes('Amikacine'))).toBe(true)
    // AUCUNE date, AUCUN nom de titulaire/fabricant injecté (c'est à l'utilisateur).
    expect(paras.some((p) => p.text.includes('KESHAVLAL'))).toBe(false)
    expect(paras.some((p) => p.text.includes('PHARMAX'))).toBe(false)
    // Formulaire : les champs vides ne génèrent AUCUN placeholder (export = saisies seules).
    expect(paras.some((p) => p.text === FILL_PLACEHOLDER)).toBe(false)
    // Les mentions statiques officielles, elles, sont toujours présentes.
    expect(
      paras.some((p) =>
        p.text.includes('Pour la liste complète des excipients, voir rubrique 6.1.'),
      ),
    ).toBe(true)
    expect(paras.some((p) => p.text.includes('vigilances.abmed@gouv.bj'))).toBe(true)
  })

  it('notice et labeling : documents de FORMULAIRE officiel (gabarits) — aucun placeholder', () => {
    const notice = buildTemplateSkeleton('notice', product())!
    const noticeNodes = flatten(notice)
    expect(noticeNodes[0]!.text).toBe('NOTICE : INFORMATION DE L’UTILISATEUR')
    expect(noticeNodes.some((n) => n.text === FILL_PLACEHOLDER)).toBe(false)
    // Identification pré-remplie (dénomination + DCI).
    expect(noticeNodes.some((n) => n.text.includes('KV-Kacin 500'))).toBe(true)
    expect(noticeNodes.some((n) => n.text.includes('Amikacine'))).toBe(true)

    const labeling = buildTemplateSkeleton('labeling', product())!
    const labelingNodes = flatten(labeling)
    expect(labelingNodes[0]!.text).toBe('ETIQUETAGE')
    expect(labelingNodes.some((n) => n.text === FILL_PLACEHOLDER)).toBe(false)
    // `artwork` (étiquetage étranger) utilise le formulaire Étiquetage.
    expect(flatten(buildTemplateSkeleton('artwork', product())!)[0]!.text).toBe('ETIQUETAGE')
  })

  it('cover/pght : squelette [À COMPLÉTER] conservé ; type inconnu → null', () => {
    const cover = buildTemplateSkeleton('cover', product())!
    expect(cover).not.toBeNull()
    expect(
      flatten(cover).filter((n) => n.type === 'paragraph' && n.text === FILL_PLACEHOLDER).length,
    ).toBeGreaterThan(0)
    expect(buildTemplateSkeleton('gmp', product())).toBeNull()
  })

  it('squelettes valides pour le pull zod (T6) — aucun nœud hors périmètre', async () => {
    const { parseTiptapContent } = await import('./tiptap-schema')
    expect(parseTiptapContent(buildTemplateSkeleton('rcp', product())!)).not.toBeNull()
    expect(parseTiptapContent(buildTemplateSkeleton('notice', product())!)).not.toBeNull()
  })
})
