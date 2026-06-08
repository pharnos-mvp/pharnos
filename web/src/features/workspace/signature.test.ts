import { Editor, type JSONContent } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'

import { hasSignature, insertSignature, removeSignature } from './signature'

function makeEditor(content: JSONContent): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, Image.configure({ inline: true, allowBase64: true })],
    content,
  })
}

const PNG = 'data:image/png;base64,AAA'

const letter: JSONContent = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '[Poste]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Signature et cachet]' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '[Nom et prénoms]' }] },
  ],
}

describe('signature (placement TipTap)', () => {
  it('insère au marqueur réservé, détecte, puis retire (toggle)', () => {
    const editor = makeEditor(letter)
    expect(hasSignature(editor)).toBe(false)

    insertSignature(editor, PNG)
    expect(hasSignature(editor)).toBe(true)
    // Le marqueur a été remplacé par l'image.
    expect(JSON.stringify(editor.getJSON())).not.toContain('Signature et cachet')

    // Re-clic → retrait, le marqueur est restauré.
    removeSignature(editor)
    expect(hasSignature(editor)).toBe(false)
    expect(JSON.stringify(editor.getJSON())).toContain('Signature et cachet')

    editor.destroy()
  })

  it('insère en fin de document si le marqueur est absent', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonjour' }] }],
    })
    insertSignature(editor, PNG)
    expect(hasSignature(editor)).toBe(true)
    editor.destroy()
  })
})
