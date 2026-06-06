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
})
