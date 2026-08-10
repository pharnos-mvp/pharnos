import { describe, expect, it } from 'vitest'

import { type BodyBlock, parse, productName, runs } from './blocks'

describe('parse — profil document', () => {
  it('ignore le préambule de travail et démarre au titre du document', () => {
    const blocks = parse(
      ['# Notes de travail', 'À ne pas livrer.', '', '## RÉSUMÉ DES CARACTÉRISTIQUES'].join('\n'),
      'document',
    )
    expect(blocks).toEqual([{ t: 'title', text: 'RÉSUMÉ DES CARACTÉRISTIQUES' }])
  })

  it('replie les lignes consécutives en un paragraphe, sauf après un saut dur', () => {
    const blocks = parse(
      ['## T', '', 'Une phrase coupée', 'à cent colonnes.', '', 'LABORATOIRE X\\', '01 BP 42'].join(
        '\n',
      ),
      'document',
    )
    const bodies = blocks.filter((b): b is BodyBlock => b.t === 'body')
    expect(bodies.map((b) => b.text)).toEqual([
      'Une phrase coupée à cent colonnes.',
      'LABORATOIRE X',
      '01 BP 42',
    ])
    expect(bodies[1]?.hard).toBe(true)
  })

  it('découpe une ligne à conduit de points en libellé, nombre et unité', () => {
    const [, lead] = parse(
      ['## T', '', '- Amikacine sulfate ......... 500 mg'].join('\n'),
      'document',
    )
    expect(lead).toEqual({ t: 'lead', label: 'Amikacine sulfate', num: '500', unit: 'mg' })
  })

  it('garde groupé un nombre écrit avec une espace insécable', () => {
    // « 500 000 UI » : le blanc est une espace INSÉCABLE (U+00A0). Coupée au premier blanc, la
    // valeur deviendrait « 500 » et le dosage serait faux dans une pièce d'AMM.
    const nbsp = String.fromCharCode(0x00a0)
    const [, lead] = parse(
      ['## T', '', `- Vitamine D ......... 500${nbsp}000 UI`].join('\n'),
      'document',
    )
    expect(lead).toEqual({ t: 'lead', label: 'Vitamine D', num: `500${nbsp}000`, unit: 'UI' })
  })

  it("garde groupé un nombre écrit avec l'espace fine insécable de la typographie française", () => {
    // U+202F — celle que produisent Word et les traitements de texte français. Elle n'était PAS
    // couverte par l'ancienne classe explicite ; `\s` la couvre.
    const nnbsp = String.fromCharCode(0x202f)
    const [, lead] = parse(
      ['## T', '', `- Vitamine D ......... 500${nnbsp}000 UI`].join('\n'),
      'document',
    )
    expect(lead).toEqual({ t: 'lead', label: 'Vitamine D', num: `500${nnbsp}000`, unit: 'UI' })
  })
})

describe('parse — profil rapport', () => {
  it("recolle les replis d'un encadré et sépare sur une ligne « > » vide", () => {
    const blocks = parse(
      ['# R', '', '> Avertissement replié', '> à cent colonnes.', '>', '> Second paragraphe.'].join(
        '\n',
      ),
      'report',
    )
    expect(blocks[1]).toEqual({
      t: 'quote',
      lines: ['Avertissement replié à cent colonnes.', 'Second paragraphe.'],
    })
  })

  it('retire la ligne de séparation du tableau et garde les cellules', () => {
    const blocks = parse(
      ['# R', '', '| Rubrique | Constat |', '|---|:---:|', '| 4.8 | Absente |'].join('\n'),
      'report',
    )
    expect(blocks[1]).toEqual({
      t: 'table',
      rows: [
        ['Rubrique', 'Constat'],
        ['4.8', 'Absente'],
      ],
    })
  })
})

describe('runs', () => {
  it('découpe gras et italique et retire les émoji de criticité', () => {
    expect(runs('🔴 un **constat** en *italique*')).toEqual([
      { text: 'un ' },
      { text: 'constat', bold: true },
      { text: ' en ' },
      { text: 'italique', italic: true },
    ])
  })
})

describe('productName', () => {
  it('lit le nom du produit dans la rubrique 1', () => {
    const blocks = parse(
      ['## T', '', '### 1. DÉNOMINATION', '', 'KV-KACIN 500, poudre pour solution.'].join('\n'),
      'document',
    )
    expect(productName(blocks)).toBe('KV-KACIN 500')
  })
})
