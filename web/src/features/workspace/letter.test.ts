import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { JSONContent } from '@tiptap/core'

import type { ProductRecord } from '@/lib/db'
import {
  buildLetterContext,
  emptyLetterFields,
  letterFieldsFromValues,
  productToLetterFields,
} from './letter-context'
import { applySignature, letterPdfBytes } from './letter-pdf'
import { TEMPLATES } from './templates'

/** Texte brut concaténé d'un doc de lettre (TipTap) — pour vérifier le contenu sans rendu. */
const docText = (d: JSONContent): string => {
  let out = ''
  const walk = (n: JSONContent): void => {
    if (n.type === 'text') out += n.text ?? ''
    for (const c of n.content ?? []) walk(c)
  }
  walk(d)
  return out
}

describe('buildLetterContext (lettre standalone Bibliothèque, pilotée par pays)', () => {
  it('le pays cible remplit le destinataire (agence + civilité + ville depuis l’adresse)', () => {
    const f = { ...emptyLetterFields('BJ'), demandeurAdresse: 'Aban House, Cotonou - 12345, Bénin' }
    const fr = buildLetterContext(f, 'fr')
    expect(fr.agencyFull).toContain('Agence Béninoise du Médicament')
    expect(fr.agencyFull).toContain('(ABMed)')
    expect(fr.agencyCivilite).toContain('Directeur') // directeur BJ = M
    expect(fr.ville).toBe('Cotonou') // extrait de l’adresse du demandeur
    const en = buildLetterContext(f, 'en')
    expect(en.agencyCiviliteEn).toBe('The Director General')
  })

  it('champs vides → marqueurs localisés (FR/EN)', () => {
    expect(buildLetterContext(emptyLetterFields('SN'), 'fr').nomCommercial).toBe('[Nom commercial]')
    expect(buildLetterContext(emptyLetterFields('SN'), 'en').nomCommercial).toBe('[Trade name]')
  })

  it('letterFieldsFromValues lit les valeurs persistées (repli sur les défauts)', () => {
    const f = letterFieldsFromValues({ country: 'ML', nomCommercial: 'X' })
    expect(f.country).toBe('ML')
    expect(f.nomCommercial).toBe('X')
    expect(f.pght).toBe('')
  })
})

describe('M3.1 — désignation autorité, devise PGHT, synchro produit', () => {
  it('la civilité du destinataire est auto-déduite de l’agence (pays cible)', () => {
    // BJ : directeur (M) → « Monsieur le Directeur Général » ; ML : directrice (F) → « Madame… »
    expect(buildLetterContext(emptyLetterFields('BJ'), 'fr').agencyCivilite).toBe(
      'Monsieur le Directeur Général',
    )
    expect(buildLetterContext(emptyLetterFields('ML'), 'fr').agencyCivilite).toBe(
      'Madame la Directrice Générale',
    )
  })

  it('devise PGHT : portée au contexte et présente dans la lettre (défaut FCFA)', () => {
    const f = { ...emptyLetterFields('SN'), pght: '12 500', pghtCurrency: 'Naira' }
    const ctx = buildLetterContext(f, 'fr')
    expect(ctx.pghtCurrency).toBe('Naira')
    const text = docText(TEMPLATES.pght.build(ctx, 'fr'))
    expect(text).toContain('PGHT (Naira)')
    expect(text).toContain('12 500')
    expect(buildLetterContext(emptyLetterFields('SN'), 'fr').pghtCurrency).toBe('FCFA')
  })

  it('productToLetterFields mappe la fiche produit (titulaire→demandeur, fabricant)', () => {
    const product: ProductRecord = {
      id: 'p1',
      orgId: 'o1',
      nomCommercial: 'KV-Super Muscle',
      dci: 'Diclofénac',
      dosage: '50 mg',
      forme: 'Comprimé',
      presentation: 'Boîte de 20',
      classeTherapeutique: '',
      codeAtc: '',
      titulaire: 'KESHAVLAL VAJECHAND',
      titulaireAdresse: 'Mumbai, Inde',
      fabricant: 'AURA LIFECARE',
      fabricantAdresse: 'Gujarat, Inde',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
    }
    const f = productToLetterFields(product)
    expect(f.nomCommercial).toBe('KV-Super Muscle')
    expect(f.demandeurNom).toBe('KESHAVLAL VAJECHAND')
    expect(f.demandeurAdresse).toBe('Mumbai, Inde')
    expect(f.fabricantNom).toBe('AURA LIFECARE')
  })
})

describe('letter-pdf — export PDF VRAI A4 (moteur partagé avec le dossier compilé)', () => {
  // 1×1 PNG valide (en-tête / pied / signature).
  const img =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='
  const cover = () => TEMPLATES.cover.build(buildLetterContext(emptyLetterFields('CI'), 'fr'), 'fr')

  const expectA4 = (pdf: PDFDocument): void => {
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    const { width, height } = pdf.getPage(0).getSize()
    // A4 = 595,28 × 841,89 pt (≠ US Letter 612 × 792) → format garanti, indépendant du navigateur.
    expect(Math.round(width)).toBe(595)
    expect(Math.round(height)).toBe(842)
  }

  it('lettre sans marque → PDF A4 d’au moins une page', async () => {
    const bytes = await letterPdfBytes(cover())
    expect(bytes.byteLength).toBeGreaterThan(0)
    expectA4(await PDFDocument.load(bytes))
  })

  it('en-tête + pied + signature (images) → reste A4 (marqueur signature → image)', async () => {
    const bytes = await letterPdfBytes(cover(), {
      headerImage: img,
      footerImage: img,
      signatureImage: img,
    })
    expectA4(await PDFDocument.load(bytes))
  })
})

describe('applySignature — marqueur « [Signature et cachet] » → nœud image (parité dossier)', () => {
  const sig = 'data:image/png;base64,QUJD'
  const para = (text: string): JSONContent => ({
    type: 'paragraph',
    attrs: { textAlign: 'right' },
    content: [{ type: 'text', text }],
  })
  const doc = (marker: string): JSONContent => ({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Veuillez agréer…' }] },
      para(marker),
    ],
  })

  it('FR : le marqueur devient un paragraphe image aligné à droite', () => {
    const last = applySignature(doc('[Signature et cachet]'), sig).content!.at(-1)!
    expect(last.attrs!.textAlign).toBe('right')
    expect(last.content![0]!.type).toBe('image')
    expect(last.content![0]!.attrs!.src).toBe(sig)
  })

  it('EN : « [Signature and stamp] » est aussi transformé', () => {
    expect(
      applySignature(doc('[Signature and stamp]'), sig).content!.at(-1)!.content![0]!.type,
    ).toBe('image')
  })

  it('sans image → doc inchangé (référence identique, marqueur texte conservé)', () => {
    const d = doc('[Signature et cachet]')
    expect(applySignature(d, null)).toBe(d)
  })

  it('marqueur absent → aucun nœud image inséré', () => {
    const out = applySignature(doc('Cordialement'), sig)
    const hasImage = out.content!.some((p) => (p.content ?? []).some((c) => c.type === 'image'))
    expect(hasImage).toBe(false)
  })
})
