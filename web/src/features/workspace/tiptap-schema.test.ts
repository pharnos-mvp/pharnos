import { describe, expect, it } from 'vitest'

import { TEMPLATES, type TemplateContext } from './templates'
import { parseTiptapContent } from './tiptap-schema'
import { textToTiptap } from './translate-doc'

// Même contexte que templates.test.ts : les templates réels doivent passer le schéma.
const ctx: TemplateContext = {
  nomCommercial: 'KV-Kacin 500',
  dci: 'Amikacine',
  dosage: '500 mg / 2 ml',
  dciDosage: 'Amikacine 500 mg / 2 ml',
  forme: 'Solution injectable',
  presentation: 'flacon de 2 ml',
  demandeurNom: 'KESHAVLAL VAJECHAND',
  demandeurAdresse: 'Aban House, 25/31 Rope Walk Street, Mumbai - 400023, Inde',
  fabricantNom: 'PHARMAX INDIA PRIVATE LIMITED',
  fabricantAdresse: 'Plot 12, GIDC, Gujarat, Inde',
  agencyName: 'AIRP',
  agencyFull: 'Autorité Ivoirienne de Régulation Pharmaceutique',
  agencyCivilite: 'Monsieur le Directeur Général',
  agencyAdresse: 'Abidjan, Cocody',
  country: 'CI',
  ville: 'Mumbai',
  date: '12 mai 2026',
  poste: 'Directeur des Affaires Réglementaires',
  signataire: 'Dr. KESHAVLAL VAJECHAND',
  pght: '5 000',
}

describe('parseTiptapContent', () => {
  it('accepte le contenu des templates réels (cover, PGHT)', () => {
    for (const def of Object.values(TEMPLATES)) {
      const content = def.build(ctx)
      expect(parseTiptapContent(content), `template ${def.key}`).not.toBeNull()
    }
  })

  it('accepte la sortie de textToTiptap (traduction)', () => {
    const content = textToTiptap('TITRE\n\nPremier paragraphe.\n\nDeuxième paragraphe.')
    expect(parseTiptapContent(content)).not.toBeNull()
  })

  it('accepte une image inline en data URL', () => {
    expect(
      parseTiptapContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=' } }],
          },
        ],
      }),
    ).not.toBeNull()
  })

  it('accepte un tableau (extension-table) et le préserve à l’identique (anti-perte au rechargement)', () => {
    const tableDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rubrique' }] }],
                },
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valeur' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colspan: 2, rowspan: 1, colwidth: null },
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Dosage : 500 mg' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const parsed = parseTiptapContent(tableDoc)
    expect(parsed).not.toBeNull()
    // Round-trip fidèle : aucune cellule/attribut perdu (le doc serveur survit save→reload).
    expect(parsed).toEqual(tableDoc)
  })

  it('refuse un colspan hors bornes (payload forgé — anti-abus)', () => {
    expect(
      parseTiptapContent({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { colspan: 100000 },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBeNull()
  })

  it('préserve l’attribut `brand` du document (toggle en-tête/pied — sinon perdu au pull)', () => {
    const off = { type: 'doc', attrs: { brand: false }, content: [{ type: 'paragraph' }] }
    const parsed = parseTiptapContent(off)
    expect(parsed).not.toBeNull()
    expect((parsed as { attrs?: { brand?: boolean } }).attrs?.brand).toBe(false)
    // Absent → accepté (défaut = papier affiché).
    expect(parseTiptapContent({ type: 'doc', content: [{ type: 'paragraph' }] })).not.toBeNull()
  })

  it('refuse une image distante (exfiltration/contenu tiers)', () => {
    expect(
      parseTiptapContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'image', attrs: { src: 'https://evil.com/pixel.png' } }],
          },
        ],
      }),
    ).toBeNull()
  })

  it('refuse les types de nœuds hors périmètre', () => {
    expect(
      parseTiptapContent({
        type: 'doc',
        content: [{ type: 'iframe', attrs: { src: 'https://evil.com' } }],
      }),
    ).toBeNull()
    expect(parseTiptapContent({ type: 'paragraph' })).toBeNull() // racine ≠ doc
    expect(parseTiptapContent('texte brut')).toBeNull()
    expect(parseTiptapContent(null)).toBeNull()
  })

  it('refuse un niveau de titre hors bornes', () => {
    expect(
      parseTiptapContent({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toBeNull()
  })

  it('refuse la profondeur excessive (anti stack-overflow)', () => {
    let node: Record<string, unknown> = { type: 'paragraph' }
    for (let i = 0; i < 200; i++) node = { type: 'blockquote', content: [node] }
    expect(parseTiptapContent({ type: 'doc', content: [node] })).toBeNull()
  })
})
