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
  it('RCP : titres officiels verrouillés, ordonnés (1 → 10 → prescription)', () => {
    const doc = buildTemplateSkeleton('rcp', product())!
    const nodes = flatten(doc)
    const headings = nodes.filter((n) => n.type === 'heading')
    expect(headings.every((h) => h.locked)).toBe(true) // structure FIGÉE
    const texts = headings.map((h) => h.text)
    expect(texts[0]).toContain('RCP')
    const idx = (frag: string) => texts.findIndex((t) => t.includes(frag))
    expect(idx('1. DÉNOMINATION')).toBeLessThan(idx('2. COMPOSITION'))
    expect(idx('4.8. Effets indésirables')).toBeGreaterThan(idx('4.1. Indications'))
    expect(idx('10. DATE DE MISE À JOUR')).toBeGreaterThan(idx('9. DATE DE PREMIÈRE'))
    expect(idx('CONDITIONS DE PRESCRIPTION')).toBeGreaterThan(idx('10. DATE'))
  })

  it('pré-remplissage STRICTEMENT Identification produit (le reste = [À COMPLÉTER])', () => {
    const doc = buildTemplateSkeleton('rcp', product())!
    const paras = flatten(doc).filter((n) => n.type === 'paragraph')
    // 1/2/3 pré-remplis depuis la fiche produit.
    expect(paras.some((p) => p.text.includes('KV-Kacin 500'))).toBe(true)
    expect(paras.some((p) => p.text.includes('Amikacine'))).toBe(true)
    // AUCUNE date, AUCUN nom de titulaire/fabricant injecté (c'est à l'utilisateur).
    expect(paras.some((p) => p.text.includes('KESHAVLAL'))).toBe(false)
    expect(paras.some((p) => p.text.includes('PHARMAX'))).toBe(false)
    // L'écrasante majorité des zones reste à compléter.
    expect(paras.filter((p) => p.text === FILL_PLACEHOLDER).length).toBeGreaterThan(15)
  })

  it('RCP 7 : sous-titres 7.1 Titulaire / 7.2 Fabricant quand titulaire ≠ fabricant (valeurs vides)', () => {
    const texts = flatten(buildTemplateSkeleton('rcp', product())!)
      .filter((n) => n.type === 'heading')
      .map((h) => h.text)
    expect(texts.some((t) => t.startsWith('7.1.'))).toBe(true)
    expect(texts.some((t) => t.startsWith('7.2. Fabricant'))).toBe(true)
  })

  it('RCP 7 : pas de découpage quand titulaire = fabricant', () => {
    const texts = flatten(
      buildTemplateSkeleton('rcp', product({ fabricant: 'KESHAVLAL VAJECHAND' }))!,
    )
      .filter((n) => n.type === 'heading')
      .map((h) => h.text)
    expect(texts.some((t) => t.startsWith('7.1.'))).toBe(false)
  })

  it('notice et labeling couverts ; type inconnu → null', () => {
    expect(buildTemplateSkeleton('notice', product())).not.toBeNull()
    expect(buildTemplateSkeleton('labeling', product())).not.toBeNull()
    expect(buildTemplateSkeleton('gmp', product())).toBeNull()
  })

  it('squelette valide pour le pull zod (T6) — aucun nœud hors périmètre', async () => {
    const { parseTiptapContent } = await import('./tiptap-schema')
    expect(parseTiptapContent(buildTemplateSkeleton('rcp', product())!)).not.toBeNull()
    expect(parseTiptapContent(buildTemplateSkeleton('notice', product())!)).not.toBeNull()
  })
})
