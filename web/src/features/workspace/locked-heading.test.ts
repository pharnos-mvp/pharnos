// Garde du squelette « Remplir le template » : les titres verrouillés sont indestructibles
// dans un VRAI éditeur TipTap (headless, jsdom) — suppression, frappe, fusion rejetées ;
// insertion de contenu utilisateur entre les titres acceptée.
import { describe, expect, it } from 'vitest'

import { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'

import { LockedHeading } from './locked-heading'

const makeEditor = () =>
  new Editor({
    extensions: [
      StarterKit.configure({ heading: false }),
      LockedHeading,
      Image.configure({ inline: true, allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, locked: true },
          content: [{ type: 'text', text: '1. DÉNOMINATION DU MÉDICAMENT' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '[À COMPLÉTER]' }] },
        {
          type: 'heading',
          attrs: { level: 2, locked: true },
          content: [{ type: 'text', text: '2. COMPOSITION' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Amikacine 500 mg' }] },
      ],
    },
  })

const headingTexts = (editor: Editor): string[] => {
  const out: string[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'heading' && n.attrs.locked) out.push(n.textContent)
  })
  return out
}

describe('LockedHeading (structure du template figée)', () => {
  it('supprimer tout le document laisse les titres verrouillés intacts', () => {
    const editor = makeEditor()
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(headingTexts(editor)).toEqual(['1. DÉNOMINATION DU MÉDICAMENT', '2. COMPOSITION'])
    editor.destroy()
  })

  it('frapper du texte dans un titre verrouillé est rejeté', () => {
    const editor = makeEditor()
    editor.commands.setTextSelection(5) // dans le 1er titre
    editor.commands.insertContent('XXX')
    expect(headingTexts(editor)[0]).toBe('1. DÉNOMINATION DU MÉDICAMENT')
    editor.destroy()
  })

  it('le contenu utilisateur entre les titres reste librement éditable', () => {
    const editor = makeEditor()
    // Remplacer le paragraphe [À COMPLÉTER] (entre les deux titres).
    const placeholderPos = editor.state.doc.resolve(0)
    void placeholderPos
    let from = 0
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'paragraph' && n.textContent === '[À COMPLÉTER]') from = pos
    })
    editor.commands.setTextSelection({ from: from + 1, to: from + 1 + '[À COMPLÉTER]'.length })
    editor.commands.insertContent('KV-Kacin 500 mg, solution injectable')
    expect(editor.state.doc.textContent).toContain('KV-Kacin 500 mg, solution injectable')
    expect(headingTexts(editor)).toHaveLength(2) // structure intacte
    editor.destroy()
  })

  it('les headings NON verrouillés (documents ordinaires) restent éditables', () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ heading: false }), LockedHeading],
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Titre libre' }],
          },
        ],
      },
    })
    editor.commands.selectAll()
    editor.commands.deleteSelection()
    expect(editor.state.doc.textContent).toBe('')
    editor.destroy()
  })
})
