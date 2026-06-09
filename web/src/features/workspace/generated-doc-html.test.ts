import type { JSONContent } from '@tiptap/core'
import { describe, expect, it } from 'vitest'

import { contentToHtml, generatedDocToHtml } from './generated-doc-html'

const doc: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Objet : ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'X & Y <z>' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }],
        },
      ],
    },
  ],
}

describe('generated-doc-html (sérialisation)', () => {
  it('rend le gras, les listes et échappe le HTML', () => {
    const html = contentToHtml(doc)
    expect(html).toContain('<strong>Objet : </strong>')
    expect(html).toContain('X &amp; Y &lt;z&gt;')
    expect(html).toContain('<ul><li><p>item</p></li></ul>')
  })

  it('produit un document HTML complet', () => {
    const full = generatedDocToHtml('Ma lettre', doc)
    expect(full).toContain('<!doctype html>')
    expect(full).toContain('<title>Ma lettre</title>')
  })

  it('applique la mise en page A4/Times New Roman et intègre en-tête/pied', () => {
    const full = generatedDocToHtml('Lettre', doc, {
      header: 'data:image/png;base64,HHH',
      footer: 'data:image/png;base64,FFF',
    })
    expect(full).toContain('@page')
    expect(full).toContain('Times New Roman')
    expect(full).toContain('data:image/png;base64,HHH')
    expect(full).toContain('data:image/png;base64,FFF')
  })

  it('rend le bloc décalé (date/destinataire/signature) en marge gauche', () => {
    const aligned: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'right' },
          content: [{ type: 'text', text: 'Cotonou, le 12 mai 2026' }],
        },
      ],
    }
    expect(contentToHtml(aligned)).toContain('style="margin-left:56%"')
  })
})
